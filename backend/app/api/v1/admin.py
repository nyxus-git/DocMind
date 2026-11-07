import uuid
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.v1.dependencies import get_current_user
from app.core.config import settings
from app.core.exceptions import DocMindException
from app.db.session import get_db
from app.models.entities import AuditEvent, Document, DocumentChunk, Job, Message, User, Workspace, WorkspaceMember
from app.models.enums import DocumentStatus, JobStatus, JobType, WorkspaceRole, WorkspaceTier
from app.repositories.audit import AuditRepository
from app.repositories.document import DocumentRepository
from app.repositories.job import JobRepository
from app.repositories.workspace import WorkspaceRepository
from app.schemas.admin import (
    AdminDocumentSummaryDTO,
    AdminOverviewDTO,
    AdminSystemDiagnosticsDTO,
    AdminWorkspaceSummaryDTO,
)
from app.schemas.workspace import AuditEventDTO, UpdateWorkspaceTierRequest

router = APIRouter(prefix="/admin", tags=["Platform Administration"])


@router.get("/overview", response_model=AdminOverviewDTO)
async def get_admin_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves platform-wide metrics, tenant counts, and service statuses."""
    total_workspaces = await db.scalar(select(func.count(Workspace.id))) or 0
    total_users = await db.scalar(select(func.count(User.id))) or 0
    total_documents = await db.scalar(select(func.count(Document.id))) or 0
    total_chunks = await db.scalar(select(func.count(DocumentChunk.id))) or 0
    total_storage = await db.scalar(select(func.coalesce(func.sum(Document.size_bytes), 0))) or 0
    total_questions = await db.scalar(select(func.count(Message.id)).where(Message.role == "user")) or 0

    tier_rows = (await db.execute(select(Workspace.tier, func.count(Workspace.id)).group_by(Workspace.tier))).all()
    active_tiers: Dict[str, int] = {str(tier): int(count) for tier, count in tier_rows}

    status_rows = (await db.execute(select(Document.status, func.count(Document.id)).group_by(Document.status))).all()
    doc_status: Dict[str, int] = {str(status_val): int(count) for status_val, count in status_rows}

    r2_status = (
        f"CONNECTED (Bucket: {settings.R2_BUCKET})"
        if settings.R2_ACCOUNT_ID and settings.R2_ACCESS_KEY_ID
        else "STANDBY / LOCAL FALLBACK"
    )

    gemini_status = (
        f"OPERATIONAL ({settings.LLM_MODEL})"
        if settings.GOOGLE_API_KEY
        else "SIMULATION MODE"
    )

    smtp_status = (
        f"DELIVERING ({settings.SMTP_HOST}:{settings.SMTP_PORT})"
        if settings.EMAIL_ENABLED and settings.SMTP_USERNAME
        else "DISABLED"
    )

    worker_status = f"HEALTHY ({settings.WORKER_CONCURRENCY} worker concurrency)"

    return AdminOverviewDTO(
        total_workspaces=total_workspaces,
        total_users=total_users,
        total_documents=total_documents,
        total_chunks=total_chunks,
        total_storage_bytes=total_storage,
        total_questions=total_questions,
        active_tiers=active_tiers,
        document_status_breakdown=doc_status,
        worker_health=worker_status,
        cloudflare_r2_status=r2_status,
        gemini_api_status=gemini_status,
        smtp_status=smtp_status
    )


@router.get("/workspaces", response_model=List[AdminWorkspaceSummaryDTO])
async def list_admin_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all customer workspaces with member counts, document totals, and storage used."""
    ws_query = select(Workspace).order_by(Workspace.created_at.desc())
    workspaces = (await db.execute(ws_query)).scalars().all()

    results: List[AdminWorkspaceSummaryDTO] = []
    for ws in workspaces:
        owner_res = await db.execute(
            select(User.email)
            .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
            .where(WorkspaceMember.workspace_id == ws.id, WorkspaceMember.role == WorkspaceRole.OWNER.value)
        )
        owner_email = owner_res.scalar_one_or_none()

        member_count = await db.scalar(
            select(func.count(WorkspaceMember.user_id)).where(WorkspaceMember.workspace_id == ws.id)
        ) or 0

        doc_count = await db.scalar(
            select(func.count(Document.id)).where(Document.workspace_id == ws.id)
        ) or 0

        storage_bytes = await db.scalar(
            select(func.coalesce(func.sum(Document.size_bytes), 0)).where(Document.workspace_id == ws.id)
        ) or 0

        results.append(
            AdminWorkspaceSummaryDTO(
                id=ws.id,
                name=ws.name,
                slug=ws.slug,
                tier=ws.tier,
                created_at=ws.created_at,
                owner_email=owner_email,
                member_count=member_count,
                document_count=doc_count,
                storage_bytes=storage_bytes
            )
        )

    return results


@router.patch("/workspaces/{workspace_id}/tier", response_model=AdminWorkspaceSummaryDTO)
async def admin_override_workspace_tier(
    workspace_id: uuid.UUID,
    req: UpdateWorkspaceTierRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Administrative override of workspace subscription tier."""
    ws_repo = WorkspaceRepository(db)
    audit_repo = AuditRepository(db)

    ws = await ws_repo.get_by_id(workspace_id)
    if not ws:
        raise DocMindException(status_code=404, code="WORKSPACE_NOT_FOUND", title="Not Found", detail="Workspace does not exist.")

    old_tier = ws.tier
    updated_ws = await ws_repo.update_tier(workspace_id, req.tier.upper())
    if not updated_ws:
        raise DocMindException(status_code=404, code="WORKSPACE_NOT_FOUND", title="Not Found", detail="Workspace update failed.")

    await audit_repo.record_event(
        workspace_id=workspace_id,
        actor_user_id=current_user.id,
        action="ADMIN_TIER_OVERRIDE",
        target_type="workspace",
        target_id=workspace_id,
        metadata={"old_tier": old_tier, "new_tier": req.tier.upper()}
    )

    owner_res = await db.execute(
        select(User.email)
        .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id == updated_ws.id, WorkspaceMember.role == WorkspaceRole.OWNER.value)
    )
    owner_email = owner_res.scalar_one_or_none()

    member_count = await db.scalar(
        select(func.count(WorkspaceMember.user_id)).where(WorkspaceMember.workspace_id == updated_ws.id)
    ) or 0
    doc_count = await db.scalar(
        select(func.count(Document.id)).where(Document.workspace_id == updated_ws.id)
    ) or 0
    storage_bytes = await db.scalar(
        select(func.coalesce(func.sum(Document.size_bytes), 0)).where(Document.workspace_id == updated_ws.id)
    ) or 0

    return AdminWorkspaceSummaryDTO(
        id=updated_ws.id,
        name=updated_ws.name,
        slug=updated_ws.slug,
        tier=updated_ws.tier,
        created_at=updated_ws.created_at,
        owner_email=owner_email,
        member_count=member_count,
        document_count=doc_count,
        storage_bytes=storage_bytes
    )


@router.get("/documents", response_model=List[AdminDocumentSummaryDTO])
async def list_admin_documents(
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists documents across all customer workspaces with error inspection."""
    query = (
        select(Document, Workspace.name)
        .join(Workspace, Document.workspace_id == Workspace.id)
        .order_by(Document.created_at.desc())
        .limit(100)
    )
    if status_filter:
        query = query.where(Document.status == status_filter.upper())

    rows = (await db.execute(query)).all()
    return [
        AdminDocumentSummaryDTO(
            id=doc.id,
            workspace_id=doc.workspace_id,
            workspace_name=ws_name,
            filename=doc.filename,
            mime_type=doc.mime_type,
            size_bytes=doc.size_bytes,
            status=doc.status,
            page_count=doc.page_count,
            created_at=doc.created_at,
            error_code=doc.error_code,
            error_message=doc.error_message
        )
        for doc, ws_name in rows
    ]


@router.post("/documents/{document_id}/retry", status_code=status.HTTP_200_OK)
async def admin_retry_document(
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Requeues a failed document for worker OCR & vector ingestion."""
    doc_repo = DocumentRepository(db)
    job_repo = JobRepository(db)
    audit_repo = AuditRepository(db)

    doc = await doc_repo.get_by_id_unscoped(document_id)
    if not doc:
        raise DocMindException(status_code=404, code="DOCUMENT_NOT_FOUND", title="Not Found", detail="Document not found.")

    await doc_repo.update_status(document_id, DocumentStatus.QUEUED.value)
    job = await job_repo.enqueue_job(
        workspace_id=doc.workspace_id,
        job_type=JobType.INGEST_DOCUMENT.value,
        payload={"document_id": str(doc.id)}
    )

    await audit_repo.record_event(
        workspace_id=doc.workspace_id,
        actor_user_id=current_user.id,
        action="ADMIN_DOCUMENT_RETRY_TRIGGERED",
        target_type="document",
        target_id=doc.id,
        metadata={"filename": doc.filename, "job_id": str(job.id)}
    )

    return {"message": f"Document {doc.filename} requeued for ingestion.", "job_id": job.id}


@router.get("/audit-logs", response_model=List[AuditEventDTO])
async def list_admin_audit_logs(
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns platform-wide audit logs across all customer organizations."""
    audit_repo = AuditRepository(db)
    events = await audit_repo.list_all_platform_events(limit=limit)
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


@router.get("/system", response_model=AdminSystemDiagnosticsDTO)
async def get_admin_system_diagnostics(
    current_user: User = Depends(get_current_user)
):
    """Returns runtime infrastructure diagnostics."""
    storage_provider = "Cloudflare R2" if settings.R2_ACCOUNT_ID and settings.R2_ACCESS_KEY_ID else "Local Filesystem Fallback"
    return AdminSystemDiagnosticsDTO(
        app_env=settings.APP_ENV,
        storage_provider=storage_provider,
        r2_bucket=settings.R2_BUCKET,
        llm_provider=settings.LLM_PROVIDER,
        llm_model=settings.LLM_MODEL,
        embedding_model=settings.EMBEDDING_MODEL,
        embedding_dimension=settings.EMBEDDING_DIMENSION,
        email_enabled=settings.EMAIL_ENABLED,
        smtp_host=settings.SMTP_HOST,
        smtp_from_email=settings.SMTP_FROM_EMAIL,
        worker_concurrency=settings.WORKER_CONCURRENCY,
        public_app_url=settings.PUBLIC_APP_URL,
        api_base_url=settings.API_BASE_URL
    )
