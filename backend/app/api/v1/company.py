import re
import uuid
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.adapters.email.smtp import get_email_provider
from app.api.v1.dependencies import WorkspaceContext, get_current_user, require_company_admin
from app.core.config import settings
from app.core.domains import normalize_corporate_domains
from app.core.exceptions import DocMindException, EntityNotFoundException
from app.core.security import generate_secure_token, hash_token
from app.db.session import get_db
from app.models.entities import (
    Document,
    KnowledgeSpace,
    MessageFeedback,
    User,
    WorkspaceJoinRequest,
    utc_now,
)
from app.models.enums import (
    DocumentStatus,
    JoinPolicy,
    JoinRequestStatus,
    SpaceVisibility,
    WorkspaceRole,
)
from app.repositories.audit import AuditRepository
from app.repositories.conversation import ConversationRepository
from app.repositories.document import DocumentRepository
from app.repositories.usage import UsageRepository
from app.repositories.user import UserRepository
from app.repositories.workspace import WorkspaceRepository
from app.schemas.company import (
    BulkInviteRequest,
    BulkInviteResponse,
    BulkInviteResultItem,
    CompanyJoinRequestDTO,
    CompanyOverviewDTO,
    CompanySettingsDTO,
    CreateSpaceRequest,
    DecideJoinRequestRequest,
    EmployeePortalInfoDTO,
    KnowledgeGapDTO,
    KnowledgeSpaceDTO,
    UpdateCompanySettingsRequest,
    UpdateSpaceRequest,
)
from app.schemas.workspace import WorkspaceMemberDTO
from app.services.quota import QuotaService

router = APIRouter(prefix="/company", tags=["Company & Employee Portal"])


async def _space_doc_counts(db: AsyncSession, workspace_id: uuid.UUID) -> Dict[uuid.UUID, int]:
    rows = (
        await db.execute(
            select(Document.space_id, func.count(Document.id))
            .where(
                Document.workspace_id == workspace_id,
                Document.space_id.is_not(None),
                Document.status != DocumentStatus.DELETED.value,
            )
            .group_by(Document.space_id)
        )
    ).all()
    out: Dict[uuid.UUID, int] = {}
    for sid, cnt in rows:
        if sid is not None:
            out[sid] = int(cnt)
    return out


def _to_space_dto(
    space: KnowledgeSpace,
    member_user_ids: List[uuid.UUID],
    doc_counts: Dict[uuid.UUID, int],
) -> KnowledgeSpaceDTO:
    return KnowledgeSpaceDTO(
        id=space.id,
        workspace_id=space.workspace_id,
        name=space.name,
        slug=space.slug,
        description=space.description,
        visibility=space.visibility,
        allowed_roles=list(space.allowed_roles or []),
        member_user_ids=member_user_ids,
        document_count=doc_counts.get(space.id, 0),
        created_at=space.created_at,
    )


@router.get("/portal-info", response_model=EmployeePortalInfoDTO)
async def get_employee_portal_info(
    current_user: User = Depends(get_current_user),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    db: AsyncSession = Depends(get_db),
):
    """Returns company branding, starter prompts, accessible spaces, or pending approval state."""
    ws_repo = WorkspaceRepository(db)
    workspaces = await ws_repo.get_user_workspaces(current_user.id)

    active_ws, active_role = (None, None)
    if x_workspace_id:
        try:
            target_id = uuid.UUID(x_workspace_id)
            for ws, role in workspaces:
                if ws.id == target_id:
                    active_ws, active_role = ws, role
                    break
        except ValueError:
            pass
    if not active_ws and workspaces:
        active_ws, active_role = workspaces[0]

    if not active_ws:
        pending = await ws_repo.get_pending_join_requests_for_user(current_user.id)
        if pending:
            _, req_ws = pending[0]
            return EmployeePortalInfoDTO(
                workspace_id=None,
                company_name=req_ws.name,
                slug=req_ws.slug,
                workspace_type="COMPANY",
                role="PENDING",
                pending_company_name=req_ws.name,
                pending_company_slug=req_ws.slug,
            )
        raise DocMindException(
            status_code=403,
            code="NO_WORKSPACE_FOUND",
            title="No Workspace",
            detail="You do not belong to any workspace yet.",
        )

    role_val = active_role or WorkspaceRole.EMPLOYEE.value
    allowed_ids = await ws_repo.get_accessible_space_ids(active_ws.id, current_user.id, role_val)
    raw_spaces = await ws_repo.list_spaces(active_ws.id)
    doc_counts = await _space_doc_counts(db, active_ws.id)
    visible_spaces = [
        _to_space_dto(sp, member_ids if role_val in (WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value) else [], doc_counts)
        for sp, member_ids in raw_spaces
        if allowed_ids is None or sp.id in allowed_ids
    ]

    return EmployeePortalInfoDTO(
        workspace_id=active_ws.id,
        company_name=active_ws.name,
        slug=active_ws.slug,
        workspace_type=active_ws.workspace_type,
        role=role_val,
        starter_prompts=list(active_ws.starter_prompts or []),
        spaces=visible_spaces,
    )


@router.get("/overview", response_model=CompanyOverviewDTO)
async def get_company_overview(
    ctx: WorkspaceContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    """Company Admin overview metrics, helpfulness score, and knowledge gaps."""
    ws = ctx.workspace
    ws_repo = WorkspaceRepository(db)
    doc_repo = DocumentRepository(db)
    usage_repo = UsageRepository(db)
    conv_repo = ConversationRepository(db)
    quota_service = QuotaService(doc_repo, usage_repo, ws_repo)

    member_count = await ws_repo.count_workspace_members(ws.id)
    pending_requests = int(
        await db.scalar(
            select(func.count(WorkspaceJoinRequest.id)).where(
                WorkspaceJoinRequest.workspace_id == ws.id,
                WorkspaceJoinRequest.status == JoinRequestStatus.PENDING.value,
            )
        )
        or 0
    )

    doc_row = (
        await db.execute(
            select(
                func.count(Document.id),
                func.coalesce(func.sum(case((Document.status == DocumentStatus.READY.value, 1), else_=0)), 0),
                func.coalesce(func.sum(Document.size_bytes), 0),
            ).where(
                Document.workspace_id == ws.id,
                Document.status != DocumentStatus.DELETED.value,
            )
        )
    ).one()
    total_docs = int(doc_row[0] or 0)
    ready_docs = int(doc_row[1] or 0)
    storage_bytes = int(doc_row[2] or 0)

    limits = await quota_service.get_tier_limits(ws.id)
    monthly_questions = await usage_repo.count_monthly_questions(ws.id)

    fb_row = (
        await db.execute(
            select(
                func.count(MessageFeedback.id),
                func.coalesce(func.sum(case((MessageFeedback.rating == 1, 1), else_=0)), 0),
            ).where(MessageFeedback.workspace_id == ws.id)
        )
    ).one()
    total_feedback = int(fb_row[0] or 0)
    helpful_count = int(fb_row[1] or 0)
    helpful_rate_pct = round((helpful_count / total_feedback) * 100.0, 1) if total_feedback > 0 else None

    spaces_count = int(
        await db.scalar(select(func.count(KnowledgeSpace.id)).where(KnowledgeSpace.workspace_id == ws.id)) or 0
    )
    gaps_raw = await conv_repo.list_knowledge_gaps(ws.id, limit=8)

    return CompanyOverviewDTO(
        workspace_id=ws.id,
        company_name=ws.name,
        slug=ws.slug,
        tier=ws.tier,
        member_count=member_count,
        pending_join_requests=pending_requests,
        total_documents=total_docs,
        ready_documents=ready_docs,
        storage_bytes=storage_bytes,
        monthly_questions=monthly_questions,
        monthly_questions_limit=limits.monthly_questions,
        helpful_rate_pct=helpful_rate_pct,
        total_feedback_count=total_feedback,
        spaces_count=spaces_count,
        recent_gaps=[KnowledgeGapDTO(**g) for g in gaps_raw],
    )


@router.get("/settings", response_model=CompanySettingsDTO)
async def get_company_settings(
    ctx: WorkspaceContext = Depends(require_company_admin),
):
    ws = ctx.workspace
    return CompanySettingsDTO(
        workspace_id=ws.id,
        name=ws.name,
        slug=ws.slug,
        tier=ws.tier,
        workspace_type=ws.workspace_type,
        allowed_domains=list(ws.allowed_domains or []),
        join_policy=ws.join_policy,
        default_join_role=ws.default_join_role,
        starter_prompts=list(ws.starter_prompts or []),
    )


@router.patch("/settings", response_model=CompanySettingsDTO)
async def update_company_settings(
    req: UpdateCompanySettingsRequest,
    ctx: WorkspaceContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    ws = ctx.workspace
    ws_repo = WorkspaceRepository(db)
    audit_repo = AuditRepository(db)

    if req.name is not None and req.name.strip():
        ws.name = req.name.strip()

    if req.allowed_domains is not None:
        try:
            normalized = normalize_corporate_domains(req.allowed_domains)
        except ValueError as exc:
            raise DocMindException(status_code=400, code="INVALID_CORPORATE_DOMAIN", title="Invalid Domain", detail=str(exc))

        conflicts = await ws_repo.find_domain_conflicts(normalized, exclude_ws_id=ws.id)
        if conflicts:
            raise DocMindException(
                status_code=409,
                code="DOMAIN_ALREADY_CLAIMED",
                title="Domain Already Claimed",
                detail=f"Domain(s) {', '.join(conflicts)} are already verified by another company.",
            )
        ws.allowed_domains = normalized

    if req.join_policy is not None:
        pol = req.join_policy.upper().strip()
        if pol not in (JoinPolicy.INVITE_ONLY.value, JoinPolicy.DOMAIN_APPROVAL.value, JoinPolicy.DOMAIN_AUTO_JOIN.value):
            raise DocMindException(status_code=400, code="INVALID_JOIN_POLICY", title="Bad Request", detail="Invalid join policy.")
        ws.join_policy = pol

    if req.default_join_role is not None:
        r = req.default_join_role.upper().strip()
        if r not in (WorkspaceRole.EMPLOYEE.value, WorkspaceRole.MEMBER.value, WorkspaceRole.VIEWER.value):
            raise DocMindException(status_code=400, code="INVALID_ROLE", title="Bad Request", detail="Default join role must be EMPLOYEE, MEMBER, or VIEWER.")
        ws.default_join_role = r

    if req.starter_prompts is not None:
        ws.starter_prompts = [p.strip() for p in req.starter_prompts if p and p.strip()][:8]

    ws.updated_at = utc_now()
    await db.flush()

    await audit_repo.record_event(
        workspace_id=ws.id,
        actor_user_id=ctx.user.id,
        action="COMPANY_SETTINGS_UPDATED",
        target_type="workspace",
        target_id=ws.id,
        metadata={
            "allowed_domains": ws.allowed_domains,
            "join_policy": ws.join_policy,
            "default_join_role": ws.default_join_role,
        },
    )

    return CompanySettingsDTO(
        workspace_id=ws.id,
        name=ws.name,
        slug=ws.slug,
        tier=ws.tier,
        workspace_type=ws.workspace_type,
        allowed_domains=list(ws.allowed_domains or []),
        join_policy=ws.join_policy,
        default_join_role=ws.default_join_role,
        starter_prompts=list(ws.starter_prompts or []),
    )


@router.get("/join-requests", response_model=List[CompanyJoinRequestDTO])
async def list_company_join_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    ctx: WorkspaceContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    ws_repo = WorkspaceRepository(db)
    rows = await ws_repo.list_join_requests(ctx.workspace.id, status_filter=status_filter)
    return [
        CompanyJoinRequestDTO(
            id=r.id,
            workspace_id=r.workspace_id,
            user_id=r.user_id,
            email=r.email,
            department_note=r.department_note,
            status=r.status,
            assigned_role=r.assigned_role,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at,
        )
        for r in rows
    ]


@router.post("/join-requests/{request_id}/decision", response_model=CompanyJoinRequestDTO)
async def decide_join_request(
    request_id: uuid.UUID,
    req: DecideJoinRequestRequest,
    ctx: WorkspaceContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    ws_repo = WorkspaceRepository(db)
    audit_repo = AuditRepository(db)
    join_req = await ws_repo.get_join_request(ctx.workspace.id, request_id)
    if not join_req:
        raise EntityNotFoundException("JoinRequest", request_id)

    decision = req.decision.upper().strip()
    if decision not in ("APPROVE", "REJECT"):
        raise DocMindException(status_code=400, code="INVALID_DECISION", title="Bad Request", detail="Decision must be APPROVE or REJECT.")

    if decision == "APPROVE":
        target_role = req.role.upper().strip()
        if target_role not in (
            WorkspaceRole.ADMIN.value,
            WorkspaceRole.MEMBER.value,
            WorkspaceRole.EMPLOYEE.value,
            WorkspaceRole.VIEWER.value,
        ):
            raise DocMindException(status_code=400, code="INVALID_ROLE", title="Bad Request", detail="Invalid role specified.")

        existing_mem = await ws_repo.get_user_membership(ctx.workspace.id, join_req.user_id)
        if not existing_mem:
            quota_svc = QuotaService(DocumentRepository(db), UsageRepository(db), ws_repo)
            await quota_svc.check_member_invite_quota(ctx.workspace.id)
            await ws_repo.add_member(ctx.workspace.id, join_req.user_id, target_role)

        if req.space_ids:
            for sid in req.space_ids:
                space = await ws_repo.get_space(ctx.workspace.id, sid)
                if space:
                    spaces_with_members = await ws_repo.list_spaces(ctx.workspace.id)
                    existing_uids = next((m for s, m in spaces_with_members if s.id == sid), [])
                    if join_req.user_id not in existing_uids:
                        await ws_repo.set_space_members(sid, [*existing_uids, join_req.user_id])

        join_req.status = JoinRequestStatus.APPROVED.value
        join_req.assigned_role = target_role
    else:
        join_req.status = JoinRequestStatus.REJECTED.value

    join_req.reviewed_by = ctx.user.id
    join_req.reviewed_at = utc_now()
    await db.flush()

    await audit_repo.record_event(
        workspace_id=ctx.workspace.id,
        actor_user_id=ctx.user.id,
        action=f"JOIN_REQUEST_{join_req.status}",
        target_type="user",
        target_id=join_req.user_id,
        metadata={"email": join_req.email, "role": join_req.assigned_role},
    )

    return CompanyJoinRequestDTO(
        id=join_req.id,
        workspace_id=join_req.workspace_id,
        user_id=join_req.user_id,
        email=join_req.email,
        department_note=join_req.department_note,
        status=join_req.status,
        assigned_role=join_req.assigned_role,
        created_at=join_req.created_at,
        reviewed_at=join_req.reviewed_at,
    )


@router.post("/invites/bulk", response_model=BulkInviteResponse)
async def bulk_invite_employees(
    req: BulkInviteRequest,
    ctx: WorkspaceContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    target_role = req.role.upper().strip()
    if target_role not in (
        WorkspaceRole.ADMIN.value,
        WorkspaceRole.MEMBER.value,
        WorkspaceRole.EMPLOYEE.value,
        WorkspaceRole.VIEWER.value,
    ):
        raise DocMindException(status_code=400, code="INVALID_ROLE", title="Bad Request", detail="Invalid role specified.")

    ws_repo = WorkspaceRepository(db)
    user_repo = UserRepository(db)
    audit_repo = AuditRepository(db)
    quota_svc = QuotaService(DocumentRepository(db), UsageRepository(db), ws_repo)
    email_provider = get_email_provider()

    unique_emails = list(dict.fromkeys(e.strip().lower() for e in req.emails if e and e.strip()))[:50]
    results: List[BulkInviteResultItem] = []
    invited_count = 0
    added_count = 0
    skipped_count = 0

    for addr in unique_emails:
        target_user = await user_repo.get_by_email(addr)
        if target_user:
            if await ws_repo.get_user_membership(ctx.workspace.id, target_user.id):
                results.append(BulkInviteResultItem(email=addr, status="SKIPPED", detail="Already a member."))
                skipped_count += 1
                continue
            await quota_svc.check_member_invite_quota(ctx.workspace.id)
            await ws_repo.add_member(ctx.workspace.id, target_user.id, target_role)
            added_count += 1
            results.append(BulkInviteResultItem(email=addr, status="ACTIVE", detail=f"Added directly as {target_role}."))
            invite_link = f"{settings.PUBLIC_APP_URL}/{ctx.workspace.slug}/?email={addr}"
        else:
            await quota_svc.check_member_invite_quota(ctx.workspace.id)
            raw_tok = generate_secure_token(24)
            await ws_repo.create_invitation(
                workspace_id=ctx.workspace.id,
                email=addr,
                role=target_role,
                invited_by=ctx.user.id,
                token_hash=hash_token(raw_tok),
                expires_days=7,
            )
            invited_count += 1
            results.append(BulkInviteResultItem(email=addr, status="INVITED", detail=f"Invitation created as {target_role}."))
            invite_link = f"{settings.PUBLIC_APP_URL}/{ctx.workspace.slug}/?email={addr}&invite_token={raw_tok}"

        try:
            await email_provider.send_member_invite_email(
                to_email=addr,
                inviter_email=ctx.user.email,
                workspace_name=ctx.workspace.name,
                invite_link=invite_link,
            )
        except Exception:
            pass

    await audit_repo.record_event(
        workspace_id=ctx.workspace.id,
        actor_user_id=ctx.user.id,
        action="BULK_EMPLOYEES_INVITED",
        target_type="workspace",
        target_id=ctx.workspace.id,
        metadata={"invited": invited_count, "added": added_count, "skipped": skipped_count, "role": target_role},
    )

    return BulkInviteResponse(
        results=results,
        invited_count=invited_count,
        added_count=added_count,
        skipped_count=skipped_count,
    )


@router.get("/spaces", response_model=List[KnowledgeSpaceDTO])
async def list_company_spaces(
    ctx: WorkspaceContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    ws_repo = WorkspaceRepository(db)
    spaces = await ws_repo.list_spaces(ctx.workspace.id)
    doc_counts = await _space_doc_counts(db, ctx.workspace.id)
    return [_to_space_dto(sp, member_ids, doc_counts) for sp, member_ids in spaces]


@router.post("/spaces", response_model=KnowledgeSpaceDTO, status_code=status.HTTP_201_CREATED)
async def create_company_space(
    req: CreateSpaceRequest,
    ctx: WorkspaceContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    ws_repo = WorkspaceRepository(db)
    audit_repo = AuditRepository(db)

    vis = req.visibility.upper().strip()
    if vis not in (SpaceVisibility.ALL_MEMBERS.value, SpaceVisibility.RESTRICTED.value):
        raise DocMindException(status_code=400, code="INVALID_VISIBILITY", title="Bad Request", detail="Visibility must be ALL_MEMBERS or RESTRICTED.")

    base_slug = re.sub(r"[^a-z0-9]+", "-", req.name.lower().strip()).strip("-") or f"space-{uuid.uuid4().hex[:6]}"
    existing_spaces = await ws_repo.list_spaces(ctx.workspace.id)
    existing_slugs = {s.slug for s, _ in existing_spaces}
    slug = base_slug if base_slug not in existing_slugs else f"{base_slug}-{uuid.uuid4().hex[:4]}"

    allowed_roles = [r.upper().strip() for r in (req.allowed_roles or ["OWNER", "ADMIN"])]
    space = KnowledgeSpace(
        workspace_id=ctx.workspace.id,
        name=req.name.strip(),
        slug=slug,
        description=req.description.strip() if req.description else None,
        visibility=vis,
        allowed_roles=allowed_roles,
        created_by=ctx.user.id,
    )
    db.add(space)
    await db.flush()

    member_ids = list(req.member_user_ids or [])
    if member_ids:
        await ws_repo.set_space_members(space.id, member_ids)

    await audit_repo.record_event(
        workspace_id=ctx.workspace.id,
        actor_user_id=ctx.user.id,
        action="KNOWLEDGE_SPACE_CREATED",
        target_type="space",
        target_id=space.id,
        metadata={"name": space.name, "visibility": space.visibility},
    )

    return _to_space_dto(space, member_ids, {})


@router.patch("/spaces/{space_id}", response_model=KnowledgeSpaceDTO)
async def update_company_space(
    space_id: uuid.UUID,
    req: UpdateSpaceRequest,
    ctx: WorkspaceContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    ws_repo = WorkspaceRepository(db)
    space = await ws_repo.get_space(ctx.workspace.id, space_id)
    if not space:
        raise EntityNotFoundException("KnowledgeSpace", space_id)

    if req.name is not None:
        space.name = req.name.strip()
    if req.description is not None:
        space.description = req.description.strip() or None
    if req.visibility is not None:
        vis = req.visibility.upper().strip()
        if vis not in (SpaceVisibility.ALL_MEMBERS.value, SpaceVisibility.RESTRICTED.value):
            raise DocMindException(status_code=400, code="INVALID_VISIBILITY", title="Bad Request", detail="Visibility must be ALL_MEMBERS or RESTRICTED.")
        space.visibility = vis
    if req.allowed_roles is not None:
        space.allowed_roles = [r.upper().strip() for r in req.allowed_roles]
    space.updated_at = utc_now()
    await db.flush()

    if req.member_user_ids is not None:
        await ws_repo.set_space_members(space.id, req.member_user_ids)

    spaces = await ws_repo.list_spaces(ctx.workspace.id)
    member_ids = next((m for s, m in spaces if s.id == space.id), [])
    doc_counts = await _space_doc_counts(db, ctx.workspace.id)
    return _to_space_dto(space, member_ids, doc_counts)


@router.delete("/spaces/{space_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company_space(
    space_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    ws_repo = WorkspaceRepository(db)
    space = await ws_repo.get_space(ctx.workspace.id, space_id)
    if not space:
        raise EntityNotFoundException("KnowledgeSpace", space_id)
    await db.delete(space)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/knowledge-gaps", response_model=List[KnowledgeGapDTO])
async def list_company_knowledge_gaps(
    limit: int = Query(50, ge=1, le=100),
    ctx: WorkspaceContext = Depends(require_company_admin),
    db: AsyncSession = Depends(get_db),
):
    conv_repo = ConversationRepository(db)
    gaps = await conv_repo.list_knowledge_gaps(ctx.workspace.id, limit=limit)
    return [KnowledgeGapDTO(**g) for g in gaps]
