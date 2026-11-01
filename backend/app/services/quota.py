import uuid
from datetime import datetime, timezone
from app.core.config import settings
from app.core.exceptions import QuotaExceededException
from app.repositories.document import DocumentRepository
from app.repositories.usage import UsageRepository
from app.schemas.usage import UsageSummaryDTO


class QuotaService:
    def __init__(self, doc_repo: DocumentRepository, usage_repo: UsageRepository):
        self.doc_repo = doc_repo
        self.usage_repo = usage_repo

    async def check_upload_quota(self, workspace_id: uuid.UUID, incoming_bytes: int) -> None:
        count, current_bytes = await self.doc_repo.count_workspace_usage(workspace_id)
        
        if count >= settings.MAX_WORKSPACE_DOCS:
            raise QuotaExceededException(
                f"Workspace document limit of {settings.MAX_WORKSPACE_DOCS} active documents reached. Delete unused documents to upload more.",
                code="WORKSPACE_DOC_LIMIT_REACHED"
            )

        max_storage_bytes = settings.MAX_WORKSPACE_STORAGE_MB * 1024 * 1024
        if current_bytes + incoming_bytes > max_storage_bytes:
            raise QuotaExceededException(
                f"Workspace storage limit of {settings.MAX_WORKSPACE_STORAGE_MB} MB exceeded.",
                code="WORKSPACE_STORAGE_LIMIT_REACHED"
            )

    async def check_question_quota(self, user_id: uuid.UUID) -> None:
        questions_used = await self.usage_repo.count_monthly_questions(user_id)
        if questions_used >= settings.MONTHLY_QUESTION_LIMIT:
            raise QuotaExceededException(
                f"Monthly limit of {settings.MONTHLY_QUESTION_LIMIT} questions reached for this account.",
                code="MONTHLY_QUESTION_LIMIT_REACHED"
            )

    async def get_usage_summary(self, workspace_id: uuid.UUID, user_id: uuid.UUID) -> UsageSummaryDTO:
        count, current_bytes = await self.doc_repo.count_workspace_usage(workspace_id)
        questions_used = await self.usage_repo.count_monthly_questions(user_id)

        now = datetime.now(timezone.utc)
        if now.month == 12:
            next_reset = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            next_reset = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)

        return UsageSummaryDTO(
            documents_count=count,
            documents_limit=settings.MAX_WORKSPACE_DOCS,
            storage_bytes=current_bytes,
            storage_limit_bytes=settings.MAX_WORKSPACE_STORAGE_MB * 1024 * 1024,
            questions_used=questions_used,
            questions_limit=settings.MONTHLY_QUESTION_LIMIT,
            billing_period_reset_date=next_reset,
            ai_features_enabled=settings.AI_FEATURES_ENABLED
        )
