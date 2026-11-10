import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from app.core.config import settings
from app.core.exceptions import QuotaExceededException, ServiceDegradedException
from app.repositories.document import DocumentRepository
from app.repositories.usage import UsageRepository
from app.repositories.workspace import WorkspaceRepository
from app.schemas.usage import TierSpecDTO, UsageSummaryDTO


class TierLimitConfig:
    def __init__(
        self,
        tier: str,
        name: str,
        max_docs: int,
        max_storage_mb: int,
        monthly_questions: int,
        max_file_mb: int,
        max_pages: int,
        concurrent_uploads: int,
        max_members: int,
        priority: str,
        features: List[str]
    ):
        self.tier = tier
        self.name = name
        self.max_docs = max_docs
        self.max_storage_mb = max_storage_mb
        self.monthly_questions = monthly_questions
        self.max_file_mb = max_file_mb
        self.max_pages = max_pages
        self.concurrent_uploads = concurrent_uploads
        self.max_members = max_members
        self.priority = priority
        self.features = features


TIER_LIMITS: Dict[str, TierLimitConfig] = {
    "STARTER": TierLimitConfig(
        tier="STARTER",
        name="Starter Personal",
        max_docs=settings.MAX_WORKSPACE_DOCS,  # 20
        max_storage_mb=settings.MAX_WORKSPACE_STORAGE_MB,  # 200 MB
        monthly_questions=settings.MONTHLY_QUESTION_LIMIT,  # 100
        max_file_mb=settings.MAX_FILE_MB,  # 20 MB
        max_pages=settings.MAX_PAGES,  # 200
        concurrent_uploads=2,
        max_members=1,
        priority="STANDARD",
        features=["1 Workspace", "20 Documents", "200 MB Storage", "100 Questions/mo", "Selective OCR"]
    ),
    "PRO": TierLimitConfig(
        tier="PRO",
        name="Pro Company",
        max_docs=500,
        max_storage_mb=10000,  # 10 GB
        monthly_questions=2500,
        max_file_mb=50,
        max_pages=500,
        concurrent_uploads=5,
        max_members=25,
        priority="HIGH",
        features=["5 Workspaces", "500 Documents", "10 GB Storage", "2,500 Questions/mo", "Fast Parallel OCR", "Team Member Governance"]
    ),
    "ENTERPRISE": TierLimitConfig(
        tier="ENTERPRISE",
        name="Enterprise",
        max_docs=5000,
        max_storage_mb=100000,  # 100 GB
        monthly_questions=25000,
        max_file_mb=100,
        max_pages=1000,
        concurrent_uploads=10,
        max_members=500,
        priority="VIP",
        features=["Unlimited Workspaces", "5,000 Documents", "100 GB Storage", "25,000 Questions/mo", "Dedicated OCR Fleet", "Full Audit Log Export", "Priority Support"]
    )
}


class QuotaService:
    def __init__(
        self,
        doc_repo: DocumentRepository,
        usage_repo: UsageRepository,
        workspace_repo: Optional[WorkspaceRepository] = None
    ):
        self.doc_repo = doc_repo
        self.usage_repo = usage_repo
        self.workspace_repo = workspace_repo

    async def get_tier_limits(self, workspace_id: uuid.UUID) -> TierLimitConfig:
        tier = "STARTER"
        if self.workspace_repo:
            ws = await self.workspace_repo.get_by_id(workspace_id)
            if ws and ws.tier:
                tier = ws.tier
        return TIER_LIMITS.get(tier.upper(), TIER_LIMITS["STARTER"])

    async def _get_tier_limits(self, workspace_id: uuid.UUID) -> TierLimitConfig:
        return await self.get_tier_limits(workspace_id)

    async def check_upload_quota(
        self,
        workspace_id: uuid.UUID,
        incoming_bytes: int,
        user_id: Optional[uuid.UUID] = None
    ) -> None:
        limits = await self._get_tier_limits(workspace_id)
        count, current_bytes = await self.doc_repo.count_workspace_usage(workspace_id)

        # 1. Document count limit
        if count >= limits.max_docs:
            raise QuotaExceededException(
                f"Workspace document limit of {limits.max_docs} active documents reached for {limits.name} tier. Upgrade to Pro or Enterprise for higher capacity.",
                code="WORKSPACE_DOC_LIMIT_REACHED"
            )

        # 2. Total storage capacity limit
        max_storage_bytes = limits.max_storage_mb * 1024 * 1024
        if current_bytes + incoming_bytes > max_storage_bytes:
            raise QuotaExceededException(
                f"Workspace storage limit of {limits.max_storage_mb} MB exceeded for {limits.name} tier.",
                code="WORKSPACE_STORAGE_LIMIT_REACHED"
            )

        # 3. Single file size limit
        max_file_bytes = limits.max_file_mb * 1024 * 1024
        if incoming_bytes > max_file_bytes:
            raise QuotaExceededException(
                f"File size exceeds maximum permitted {limits.max_file_mb} MB on {limits.name} tier.",
                code="FILE_TOO_LARGE"
            )

        # 4. Concurrent active upload limit per user
        if user_id:
            active_uploads = await self.doc_repo.count_user_active_uploads(user_id)
            if active_uploads >= limits.concurrent_uploads:
                raise QuotaExceededException(
                    f"Concurrent upload limit of {limits.concurrent_uploads} active uploads reached. Please wait for existing uploads to complete.",
                    code="CONCURRENT_UPLOADS_EXCEEDED"
                )

    async def check_question_quota(self, workspace_id: uuid.UUID, user_id: uuid.UUID) -> None:
        if not settings.AI_FEATURES_ENABLED:
            raise ServiceDegradedException("AI operations are temporarily disabled by administrator policy.")

        limits = await self._get_tier_limits(workspace_id)
        questions_used = await self.usage_repo.count_monthly_questions(workspace_id)
        if questions_used >= limits.monthly_questions:
            raise QuotaExceededException(
                f"Monthly limit of {limits.monthly_questions} AI questions reached for {limits.name} tier. Upgrade workspace to continue querying.",
                code="MONTHLY_QUESTION_LIMIT_REACHED"
            )

        if settings.AI_MONTHLY_BUDGET_USD > 0:
            platform_spend = await self.usage_repo.get_monthly_cost_usd()
            if float(platform_spend) >= settings.AI_MONTHLY_BUDGET_USD:
                raise ServiceDegradedException(
                    "Monthly platform AI budget threshold reached. Please contact support or your platform administrator."
                )

    async def check_member_invite_quota(self, workspace_id: uuid.UUID) -> None:
        limits = await self._get_tier_limits(workspace_id)
        if self.workspace_repo:
            current_members = await self.workspace_repo.count_workspace_members(workspace_id)
            if current_members >= limits.max_members:
                raise QuotaExceededException(
                    f"Team member limit of {limits.max_members} reached for {limits.name} tier. Upgrade to Pro for multi-user collaboration.",
                    code="WORKSPACE_MEMBER_LIMIT_REACHED"
                )

    async def get_usage_summary(self, workspace_id: uuid.UUID, user_id: uuid.UUID) -> UsageSummaryDTO:
        limits = await self._get_tier_limits(workspace_id)
        count, current_bytes = await self.doc_repo.count_workspace_usage(workspace_id)
        questions_used = await self.usage_repo.count_monthly_questions(workspace_id)

        now = datetime.now(timezone.utc)
        if now.month == 12:
            next_reset = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            next_reset = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)

        return UsageSummaryDTO(
            documents_count=count,
            documents_limit=limits.max_docs,
            storage_bytes=current_bytes,
            storage_limit_bytes=limits.max_storage_mb * 1024 * 1024,
            questions_used=questions_used,
            questions_limit=limits.monthly_questions,
            billing_period_reset_date=next_reset,
            ai_features_enabled=settings.AI_FEATURES_ENABLED,
            tier=limits.tier,
            tier_name=limits.name,
            max_file_mb=limits.max_file_mb,
            max_pages=limits.max_pages,
            concurrent_uploads_limit=limits.concurrent_uploads,
            max_members_limit=limits.max_members
        )

    @staticmethod
    def get_tier_catalogue() -> List[TierSpecDTO]:
        return [
            TierSpecDTO(
                tier=t.tier,
                name=t.name,
                max_docs=t.max_docs,
                max_storage_mb=t.max_storage_mb,
                monthly_questions=t.monthly_questions,
                max_file_mb=t.max_file_mb,
                max_pages=t.max_pages,
                concurrent_uploads=t.concurrent_uploads,
                max_members=t.max_members,
                priority=t.priority,
                features=t.features
            )
            for t in TIER_LIMITS.values()
        ]
