import csv
import io
import json
import re
import uuid
from typing import List
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.adapters.email.smtp import get_email_provider
from app.api.v1.dependencies import get_current_user
from app.core.config import settings
from app.core.domains import sanitize_company_slug
from app.core.exceptions import CrossTenantAccessException, DocMindException
from app.core.http_safety import csv_safe_cell
from app.core.security import generate_secure_token, hash_token
from app.db.session import get_db
from app.models.entities import User
from app.models.enums import WorkspaceRole, WorkspaceTier, WorkspaceType
from app.repositories.api_key import ApiKeyRepository
from app.repositories.audit import AuditRepository
from app.repositories.document import DocumentRepository
from app.repositories.usage import UsageRepository
from app.repositories.user import UserRepository
from app.repositories.workspace import WorkspaceRepository
from app.schemas.workspace import (
    ApiKeyDTO,
    AuditEventDTO,
    CreateApiKeyRequest,
    CreateApiKeyResponse,
    CreateCompanyWorkspaceRequest,
    InviteMemberRequest,
    InviteMemberResponse,
    PendingInviteDTO,
    TransferOwnershipRequest,
    UpdateMemberRoleRequest,
    UpdateWorkspaceRequest,
    UpdateWorkspaceTierRequest,
    WorkspaceDetailDTO,
    WorkspaceMemberDTO,
)
from app.services.quota import QuotaService

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


def slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


@router.get("", response_model=List[WorkspaceDetailDTO])
async def list_user_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all workspaces the authenticated user belongs to."""
    ws_repo = WorkspaceRepository(db)
    workspaces_with_role = await ws_repo.get_user_workspaces(current_user.id)
    if not workspaces_with_role:
        return []

    member_counts = await ws_repo.count_members_by_workspace([ws.id for ws, _ in workspaces_with_role])
    return [
        WorkspaceDetailDTO(
            id=ws.id,
            name=ws.name,
            slug=ws.slug,
            tier=ws.tier,
            workspace_type=ws.workspace_type,
            role=role,
            created_at=ws.created_at,
            member_count=member_counts.get(ws.id, 0),
        )
        for ws, role in workspaces_with_role
    ]


@router.post("/company", response_model=WorkspaceDetailDTO, status_code=status.HTTP_201_CREATED)
async def create_company_workspace(
    req: CreateCompanyWorkspaceRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Creates a new company / organization workspace with caller as OWNER."""
    ws_repo = WorkspaceRepository(db)
    audit_repo = AuditRepository(db)

    slug = sanitize_company_slug(req.slug or req.name, fallback=f"ws-{uuid.uuid4().hex[:8]}")

    existing = await ws_repo.get_by_slug(slug)
    if existing:
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"

    tier = req.tier.upper() if req.tier else WorkspaceTier.PRO.value
    if tier not in [WorkspaceTier.STARTER.value, WorkspaceTier.PRO.value, WorkspaceTier.ENTERPRISE.value]:
        tier = WorkspaceTier.PRO.value

    workspace = await ws_repo.create_workspace(
        name=req.name.strip(),
        slug=slug,
        created_by=current_user.id,
        tier=tier,
        workspace_type=WorkspaceType.COMPANY.value,
    )

    await audit_repo.record_event(
        workspace_id=workspace.id,
        actor_user_id=current_user.id,
        action="WORKSPACE_CREATED",
        target_type="workspace",
        target_id=workspace.id,
        metadata={"name": workspace.name, "tier": workspace.tier}
    )

    return WorkspaceDetailDTO(
        id=workspace.id,
        name=workspace.name,
        slug=workspace.slug,
        tier=workspace.tier,
        workspace_type=workspace.workspace_type,
        role=WorkspaceRole.OWNER.value,
        created_at=workspace.created_at,
        member_count=1
    )


@router.get("/{workspace_id}", response_model=WorkspaceDetailDTO)
async def get_workspace_detail(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Gets details of a specific workspace, enforcing tenant membership."""
    ws_repo = WorkspaceRepository(db)
    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership:
        raise CrossTenantAccessException()

    ws = await ws_repo.get_by_id(workspace_id)
    if not ws:
        raise DocMindException(status_code=404, code="WORKSPACE_NOT_FOUND", title="Not Found", detail="Workspace does not exist.")

    count = await ws_repo.count_workspace_members(workspace_id)
    return WorkspaceDetailDTO(
        id=ws.id,
        name=ws.name,
        slug=ws.slug,
        tier=ws.tier,
        workspace_type=ws.workspace_type,
        role=membership.role,
        created_at=ws.created_at,
        member_count=count
    )


@router.patch("/{workspace_id}/tier", response_model=WorkspaceDetailDTO)
async def update_workspace_tier(
    workspace_id: uuid.UUID,
    req: UpdateWorkspaceTierRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Updates the subscription tier for a workspace (restricted to OWNER; gated in production)."""
    ws_repo = WorkspaceRepository(db)
    audit_repo = AuditRepository(db)

    if settings.APP_ENV == "production" and not current_user.is_superadmin:
        raise DocMindException(
            status_code=403,
            code="BILLING_UPGRADE_REQUIRED",
            title="Upgrade Requires Approval",
            detail="Self-service plan changes are disabled in production. Contact support or a Platform Administrator.",
        )

    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership or membership.role != WorkspaceRole.OWNER.value:
        raise DocMindException(
            status_code=403,
            code="INSUFFICIENT_PERMISSIONS",
            title="Forbidden",
            detail="Only workspace Owners can modify subscription tiers."
        )

    target_tier = req.tier.upper()
    if target_tier not in [WorkspaceTier.STARTER.value, WorkspaceTier.PRO.value, WorkspaceTier.ENTERPRISE.value]:
        raise DocMindException(
            status_code=400,
            code="INVALID_TIER",
            title="Bad Request",
            detail="Tier must be one of: STARTER, PRO, ENTERPRISE."
        )

    updated = await ws_repo.update_tier(workspace_id, target_tier)
    if not updated:
        raise DocMindException(status_code=404, code="WORKSPACE_NOT_FOUND", title="Not Found", detail="Workspace does not exist.")

    await audit_repo.record_event(
        workspace_id=workspace_id,
        actor_user_id=current_user.id,
        action="WORKSPACE_TIER_UPDATED",
        target_type="workspace",
        target_id=workspace_id,
        metadata={"new_tier": target_tier}
    )

    count = await ws_repo.count_workspace_members(workspace_id)
    return WorkspaceDetailDTO(
        id=updated.id,
        name=updated.name,
        slug=updated.slug,
        tier=updated.tier,
        workspace_type=updated.workspace_type,
        role=membership.role,
        created_at=updated.created_at,
        member_count=count
    )


@router.get("/{workspace_id}/members", response_model=List[WorkspaceMemberDTO])
async def list_workspace_members(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all team members in the given workspace."""
    ws_repo = WorkspaceRepository(db)
    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership:
        raise CrossTenantAccessException()

    members = await ws_repo.get_members(workspace_id)
    return [
        WorkspaceMemberDTO(
            user_id=member.user_id,
            email=email,
            role=member.role,
            joined_at=member.joined_at
        )
        for member, email in members
    ]


@router.post("/{workspace_id}/invites", response_model=InviteMemberResponse)
async def invite_workspace_member(
    workspace_id: uuid.UUID,
    req: InviteMemberRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Invites a team member to the workspace while enforcing tier limits."""
    ws_repo = WorkspaceRepository(db)
    user_repo = UserRepository(db)
    doc_repo = DocumentRepository(db)
    usage_repo = UsageRepository(db)
    audit_repo = AuditRepository(db)
    quota_service = QuotaService(doc_repo, usage_repo, ws_repo)

    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership or membership.role not in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]:
        raise DocMindException(
            status_code=403,
            code="INSUFFICIENT_PERMISSIONS",
            title="Forbidden",
            detail="Only workspace Owners and Admins can invite team members."
        )

    # Enforce tier member limits (Starter = 1, Pro = 25, Enterprise = 500)
    await quota_service.check_member_invite_quota(workspace_id)

    # Validate target role
    target_role = req.role.upper()
    if target_role not in [WorkspaceRole.ADMIN.value, WorkspaceRole.MEMBER.value, WorkspaceRole.EMPLOYEE.value, WorkspaceRole.VIEWER.value]:
        raise DocMindException(
            status_code=400,
            code="INVALID_ROLE",
            title="Bad Request",
            detail="Role must be one of: ADMIN, MEMBER, EMPLOYEE, VIEWER."
        )

    ws = await ws_repo.get_by_id(workspace_id)
    ws_name = ws.name if ws else "DocMind Workspace"
    if ws and ws.workspace_type == WorkspaceType.COMPANY.value:
        invite_link = f"{settings.PUBLIC_APP_URL}/{ws.slug}/?email={req.email}"
    else:
        invite_link = f"{settings.PUBLIC_APP_URL}/auth?action=invite&workspace={workspace_id}&email={req.email}"
    email_provider = get_email_provider()

    # Look up user by email
    target_user = await user_repo.get_by_email(req.email)
    if target_user:
        existing_mem = await ws_repo.get_user_membership(workspace_id, target_user.id)
        if existing_mem:
            raise DocMindException(
                status_code=409,
                code="ALREADY_MEMBER",
                title="Conflict",
                detail=f"User {req.email} is already a member of this workspace."
            )
        await ws_repo.add_member(workspace_id, target_user.id, target_role)
        await audit_repo.record_event(
            workspace_id=workspace_id,
            actor_user_id=current_user.id,
            action="MEMBER_ADDED",
            target_type="user",
            target_id=target_user.id,
            metadata={"email": req.email, "role": target_role}
        )
        try:
            await email_provider.send_member_invite_email(
                to_email=req.email,
                inviter_email=current_user.email,
                workspace_name=ws_name,
                invite_link=invite_link
            )
        except Exception:
            pass

        return InviteMemberResponse(
            workspace_id=workspace_id,
            email=req.email,
            role=target_role,
            status="ACTIVE",
            message=f"Added {req.email} directly to workspace as {target_role}."
        )

    # User does not exist yet; persist pending invitation + audit
    raw_invite_token = generate_secure_token(24)
    await ws_repo.create_invitation(
        workspace_id=workspace_id,
        email=req.email,
        role=target_role,
        invited_by=current_user.id,
        token_hash=hash_token(raw_invite_token),
        expires_days=7,
    )
    invite_link_with_tok = f"{invite_link}&invite_token={raw_invite_token}"

    await audit_repo.record_event(
        workspace_id=workspace_id,
        actor_user_id=current_user.id,
        action="MEMBER_INVITED",
        target_type="email",
        metadata={"email": req.email, "role": target_role}
    )
    try:
        await email_provider.send_member_invite_email(
            to_email=req.email,
            inviter_email=current_user.email,
            workspace_name=ws_name,
            invite_link=invite_link_with_tok
        )
    except Exception:
        pass

    return InviteMemberResponse(
        workspace_id=workspace_id,
        email=req.email,
        role=target_role,
        status="INVITED",
        message=f"Invitation sent to {req.email}. Member will be automatically linked upon account creation."
    )


@router.get("/{workspace_id}/invites", response_model=List[PendingInviteDTO])
async def list_pending_invites(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists active pending workspace invitations (OWNER / ADMIN)."""
    ws_repo = WorkspaceRepository(db)
    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership or membership.role not in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]:
        raise DocMindException(status_code=403, code="INSUFFICIENT_PERMISSIONS", title="Forbidden", detail="Only workspace Owners and Admins can view invitations.")

    invites = await ws_repo.list_pending_invitations(workspace_id)
    return [
        PendingInviteDTO(
            id=inv.id,
            workspace_id=inv.workspace_id,
            email=inv.email,
            role=inv.role,
            status=inv.status,
            expires_at=inv.expires_at,
            created_at=inv.created_at,
        )
        for inv in invites
    ]


@router.delete("/{workspace_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_pending_invite(
    workspace_id: uuid.UUID,
    invite_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Revokes a pending workspace invitation."""
    ws_repo = WorkspaceRepository(db)
    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership or membership.role not in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]:
        raise DocMindException(status_code=403, code="INSUFFICIENT_PERMISSIONS", title="Forbidden", detail="Only workspace Owners and Admins can revoke invitations.")

    revoked = await ws_repo.revoke_invitation(workspace_id, invite_id)
    if not revoked:
        raise DocMindException(status_code=404, code="INVITE_NOT_FOUND", title="Not Found", detail="Pending invitation not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{workspace_id}/members/{target_user_id}", response_model=WorkspaceMemberDTO)
async def update_member_role(
    workspace_id: uuid.UUID,
    target_user_id: uuid.UUID,
    req: UpdateMemberRoleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Updates the role of an existing workspace member."""
    ws_repo = WorkspaceRepository(db)
    audit_repo = AuditRepository(db)

    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership or membership.role not in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]:
        raise DocMindException(
            status_code=403,
            code="INSUFFICIENT_PERMISSIONS",
            title="Forbidden",
            detail="Only workspace Owners and Admins can modify member roles."
        )

    target_membership = await ws_repo.get_user_membership(workspace_id, target_user_id)
    if not target_membership:
        raise DocMindException(status_code=404, code="MEMBER_NOT_FOUND", title="Not Found", detail="Member not found in workspace.")

    if target_membership.role == WorkspaceRole.OWNER.value and membership.role != WorkspaceRole.OWNER.value:
        raise DocMindException(status_code=403, code="CANNOT_MODIFY_OWNER", title="Forbidden", detail="Only workspace Owners can modify Owner roles.")

    new_role = req.role.upper()
    if new_role not in [WorkspaceRole.ADMIN.value, WorkspaceRole.MEMBER.value, WorkspaceRole.EMPLOYEE.value, WorkspaceRole.VIEWER.value]:
        raise DocMindException(
            status_code=400,
            code="INVALID_ROLE",
            title="Bad Request",
            detail="Role must be ADMIN, MEMBER, EMPLOYEE, or VIEWER. Use /transfer-ownership to assign an Owner.",
        )

    updated = await ws_repo.update_member_role(workspace_id, target_user_id, new_role)
    if not updated:
        raise DocMindException(status_code=404, code="MEMBER_NOT_FOUND", title="Not Found", detail="Member not found in workspace.")

    await audit_repo.record_event(
        workspace_id=workspace_id,
        actor_user_id=current_user.id,
        action="MEMBER_ROLE_UPDATED",
        target_type="user",
        target_id=target_user_id,
        metadata={"new_role": new_role}
    )

    user_repo = UserRepository(db)
    target_user = await user_repo.get_by_id(target_user_id)

    return WorkspaceMemberDTO(
        user_id=target_user_id,
        email=target_user.email if target_user else "unknown",
        role=updated.role,
        joined_at=updated.joined_at
    )


@router.delete("/{workspace_id}/members/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_workspace_member(
    workspace_id: uuid.UUID,
    target_user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Removes a team member from the workspace."""
    ws_repo = WorkspaceRepository(db)
    audit_repo = AuditRepository(db)

    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership:
        raise CrossTenantAccessException()

    is_admin = membership.role in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]
    is_self = current_user.id == target_user_id

    if not (is_admin or is_self):
        raise DocMindException(status_code=403, code="INSUFFICIENT_PERMISSIONS", title="Forbidden", detail="Cannot remove member from workspace.")

    target_membership = await ws_repo.get_user_membership(workspace_id, target_user_id)
    if not target_membership:
        raise DocMindException(status_code=404, code="MEMBER_NOT_FOUND", title="Not Found", detail="Member not found.")

    if target_membership.role == WorkspaceRole.OWNER.value:
        raise DocMindException(status_code=400, code="CANNOT_REMOVE_OWNER", title="Bad Request", detail="Cannot remove workspace Owner. Transfer ownership first.")

    await ws_repo.remove_member(workspace_id, target_user_id)

    await audit_repo.record_event(
        workspace_id=workspace_id,
        actor_user_id=current_user.id,
        action="MEMBER_REMOVED",
        target_type="user",
        target_id=target_user_id,
        metadata={"removed_by": str(current_user.id)}
    )
    return None


@router.get("/{workspace_id}/audit-logs", response_model=List[AuditEventDTO])
async def list_workspace_audit_logs(
    workspace_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists recent audit events for the workspace (restricted to OWNER and ADMIN)."""
    ws_repo = WorkspaceRepository(db)
    audit_repo = AuditRepository(db)

    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership or membership.role not in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]:
        raise DocMindException(
            status_code=403,
            code="INSUFFICIENT_PERMISSIONS",
            title="Forbidden",
            detail="Only workspace Owners and Admins can view audit logs."
        )

    events = await audit_repo.list_events(workspace_id, limit=limit, offset=offset)
    return [
        AuditEventDTO(
            id=event.id,
            workspace_id=event.workspace_id,
            actor_user_id=event.actor_user_id,
            actor_email=actor_email,
            action=event.action,
            target_type=event.target_type,
            target_id=event.target_id,
            metadata=event.audit_metadata,
            created_at=event.created_at
        )
        for event, actor_email in events
    ]


@router.get("/{workspace_id}/audit-logs/export")
async def export_workspace_audit_logs(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Exports workspace audit trail as CSV for compliance & SOC 2 reporting."""
    ws_repo = WorkspaceRepository(db)
    audit_repo = AuditRepository(db)

    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership or membership.role not in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]:
        raise DocMindException(status_code=403, code="INSUFFICIENT_PERMISSIONS", title="Forbidden", detail="Only workspace Owners and Admins can export audit logs.")

    events = await audit_repo.list_events(workspace_id, limit=1000, offset=0)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Timestamp (UTC)", "Actor Email", "Action", "Target Type", "Target ID", "Metadata JSON"])
    for event, actor_email in events:
        writer.writerow([
            csv_safe_cell(event.created_at.isoformat()),
            csv_safe_cell(actor_email or "system"),
            csv_safe_cell(event.action),
            csv_safe_cell(event.target_type),
            csv_safe_cell(str(event.target_id) if event.target_id else ""),
            csv_safe_cell(json.dumps(event.audit_metadata or {})),
        ])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="docmind_audit_{workspace_id}.csv"'},
    )


@router.patch("/{workspace_id}", response_model=WorkspaceDetailDTO)
async def update_workspace_name(
    workspace_id: uuid.UUID,
    req: UpdateWorkspaceRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Renames a workspace (restricted to OWNER / ADMIN)."""
    ws_repo = WorkspaceRepository(db)
    audit_repo = AuditRepository(db)

    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership or membership.role not in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]:
        raise DocMindException(status_code=403, code="INSUFFICIENT_PERMISSIONS", title="Forbidden", detail="Only workspace Owners and Admins can rename this workspace.")

    updated = await ws_repo.rename_workspace(workspace_id, req.name)
    if not updated:
        raise DocMindException(status_code=404, code="WORKSPACE_NOT_FOUND", title="Not Found", detail="Workspace does not exist.")

    await audit_repo.record_event(
        workspace_id=workspace_id,
        actor_user_id=current_user.id,
        action="WORKSPACE_RENAMED",
        target_type="workspace",
        target_id=workspace_id,
        metadata={"name": updated.name}
    )

    count = await ws_repo.count_workspace_members(workspace_id)
    return WorkspaceDetailDTO(
        id=updated.id,
        name=updated.name,
        slug=updated.slug,
        tier=updated.tier,
        workspace_type=updated.workspace_type,
        role=membership.role,
        created_at=updated.created_at,
        member_count=count
    )


@router.post("/{workspace_id}/transfer-ownership", response_model=WorkspaceMemberDTO)
async def transfer_workspace_ownership(
    workspace_id: uuid.UUID,
    req: TransferOwnershipRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Transfers workspace OWNER role to another existing member."""
    ws_repo = WorkspaceRepository(db)
    user_repo = UserRepository(db)
    audit_repo = AuditRepository(db)

    if req.new_owner_user_id == current_user.id:
        raise DocMindException(status_code=400, code="SAME_OWNER", title="Bad Request", detail="You are already the workspace owner.")

    updated_member = await ws_repo.transfer_ownership(workspace_id, current_user.id, req.new_owner_user_id)
    if not updated_member:
        raise DocMindException(status_code=403, code="TRANSFER_FAILED", title="Forbidden", detail="Only current workspace Owner can transfer ownership to an existing member.")

    await audit_repo.record_event(
        workspace_id=workspace_id,
        actor_user_id=current_user.id,
        action="WORKSPACE_OWNERSHIP_TRANSFERRED",
        target_type="user",
        target_id=req.new_owner_user_id,
        metadata={"previous_owner": str(current_user.id)}
    )

    target_user = await user_repo.get_by_id(req.new_owner_user_id)
    return WorkspaceMemberDTO(
        user_id=req.new_owner_user_id,
        email=target_user.email if target_user else "unknown",
        role=updated_member.role,
        joined_at=updated_member.joined_at
    )


@router.get("/{workspace_id}/api-keys", response_model=List[ApiKeyDTO])
async def list_workspace_api_keys(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists active API keys for programmatic access to this workspace."""
    ws_repo = WorkspaceRepository(db)
    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership or membership.role not in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]:
        raise DocMindException(status_code=403, code="INSUFFICIENT_PERMISSIONS", title="Forbidden", detail="Only workspace Owners and Admins can manage API keys.")

    api_repo = ApiKeyRepository(db)
    keys = await api_repo.list_keys(workspace_id)
    return [
        ApiKeyDTO(
            id=k.id,
            name=k.name,
            key_prefix=k.key_prefix,
            scopes=list(k.scopes or ["read", "write"]),
            last_used_at=k.last_used_at,
            created_at=k.created_at,
        )
        for k in keys
    ]


@router.post("/{workspace_id}/api-keys", response_model=CreateApiKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace_api_key(
    workspace_id: uuid.UUID,
    req: CreateApiKeyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Creates a new scoped workspace API key; full secret is returned only once."""
    ws_repo = WorkspaceRepository(db)
    audit_repo = AuditRepository(db)

    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership or membership.role not in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]:
        raise DocMindException(status_code=403, code="INSUFFICIENT_PERMISSIONS", title="Forbidden", detail="Only workspace Owners and Admins can create API keys.")

    valid_scopes = [s for s in req.scopes if s in ("read", "write")] or ["read", "write"]
    raw_secret = f"dm_live_{generate_secure_token(24)}"
    key_prefix = f"{raw_secret[:14]}..."
    key_hash = hash_token(raw_secret)

    api_repo = ApiKeyRepository(db)
    rec = await api_repo.create_key(
        workspace_id=workspace_id,
        created_by=current_user.id,
        name=req.name,
        key_prefix=key_prefix,
        key_hash=key_hash,
        scopes=valid_scopes,
    )

    await audit_repo.record_event(
        workspace_id=workspace_id,
        actor_user_id=current_user.id,
        action="API_KEY_CREATED",
        target_type="api_key",
        target_id=rec.id,
        metadata={"name": rec.name, "scopes": valid_scopes}
    )

    return CreateApiKeyResponse(
        id=rec.id,
        name=rec.name,
        key_prefix=rec.key_prefix,
        scopes=valid_scopes,
        last_used_at=rec.last_used_at,
        created_at=rec.created_at,
        secret_key=raw_secret,
    )


@router.delete("/{workspace_id}/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_workspace_api_key(
    workspace_id: uuid.UUID,
    key_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Revokes a workspace API key immediately."""
    ws_repo = WorkspaceRepository(db)
    audit_repo = AuditRepository(db)

    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership or membership.role not in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]:
        raise DocMindException(status_code=403, code="INSUFFICIENT_PERMISSIONS", title="Forbidden", detail="Only workspace Owners and Admins can revoke API keys.")

    api_repo = ApiKeyRepository(db)
    revoked = await api_repo.revoke_key(workspace_id, key_id)
    if not revoked:
        raise DocMindException(status_code=404, code="API_KEY_NOT_FOUND", title="Not Found", detail="Active API key not found.")

    await audit_repo.record_event(
        workspace_id=workspace_id,
        actor_user_id=current_user.id,
        action="API_KEY_REVOKED",
        target_type="api_key",
        target_id=key_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
