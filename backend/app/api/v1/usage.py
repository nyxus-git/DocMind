import uuid
from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.v1.dependencies import WorkspaceContext, get_current_workspace
from app.core.exceptions import EntityNotFoundException
from app.db.session import get_db
from app.repositories.conversation import ConversationRepository
from app.repositories.document import DocumentRepository
from app.repositories.job import JobRepository
from app.repositories.usage import UsageRepository
from app.repositories.workspace import WorkspaceRepository
from app.schemas.chat import ConversationDTO
from app.schemas.usage import DashboardDTO, JobDTO, TierSpecDTO, UsageSummaryDTO
from app.services.document import DocumentService
from app.services.quota import QuotaService

router = APIRouter(tags=["Usage & Operations"])


@router.get("/usage", response_model=UsageSummaryDTO)
async def get_usage_metrics(
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    doc_repo = DocumentRepository(db)
    usage_repo = UsageRepository(db)
    ws_repo = WorkspaceRepository(db)
    quota_service = QuotaService(doc_repo, usage_repo, ws_repo)
    return await quota_service.get_usage_summary(ctx.workspace.id, ctx.user.id)


@router.get("/tiers", response_model=List[TierSpecDTO])
async def get_tier_catalogue():
    """Returns the full SaaS subscription tier specification catalogue."""
    return QuotaService.get_tier_catalogue()


@router.get("/dashboard/summary", response_model=DashboardDTO)
async def get_dashboard_summary(
    limit: int = Query(50, ge=1, le=100),
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    doc_repo = DocumentRepository(db)
    usage_repo = UsageRepository(db)
    conv_repo = ConversationRepository(db)
    ws_repo = WorkspaceRepository(db)
    doc_service = DocumentService(db)
    quota_service = QuotaService(doc_repo, usage_repo, ws_repo)

    usage = await quota_service.get_usage_summary(ctx.workspace.id, ctx.user.id)
    recent_docs = await doc_service.list_documents(ctx.workspace.id, limit=limit)
    recent_convs = await conv_repo.list_conversations(ctx.workspace.id, limit=limit)

    recent_conv_dtos = [
        ConversationDTO(
            id=c.id,
            workspace_id=c.workspace_id,
            title=c.title,
            scope_mode=c.scope_mode,
            selected_doc_ids=[uuid.UUID(i) for i in (c.selected_doc_ids or [])],
            created_at=c.created_at,
            updated_at=c.updated_at
        )
        for c in recent_convs
    ]

    return DashboardDTO(
        usage=usage,
        recent_documents=recent_docs,
        recent_conversations=recent_conv_dtos,
        is_superadmin=bool(ctx.user.is_superadmin),
    )


@router.get("/jobs/{job_id}", response_model=JobDTO)
async def get_job_status(
    job_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    job_repo = JobRepository(db)
    job = await job_repo.get_by_id(job_id)
    if not job or job.workspace_id != ctx.workspace.id:
        raise EntityNotFoundException("Job", job_id)

    return JobDTO(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        attempts=job.attempts,
        max_attempts=job.max_attempts,
        created_at=job.created_at,
        last_error=job.last_error
    )
