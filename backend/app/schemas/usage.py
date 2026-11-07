import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from app.schemas.chat import ConversationDTO
from app.schemas.document import DocumentDTO


class UsageSummaryDTO(BaseModel):
    documents_count: int
    documents_limit: int
    storage_bytes: int
    storage_limit_bytes: int
    questions_used: int
    questions_limit: int
    billing_period_reset_date: datetime
    ai_features_enabled: bool
    tier: str = "STARTER"
    tier_name: str = "Starter"
    max_file_mb: int = 20
    max_pages: int = 200
    concurrent_uploads_limit: int = 2
    max_members_limit: int = 1


class TierSpecDTO(BaseModel):
    tier: str
    name: str
    max_docs: int
    max_storage_mb: int
    monthly_questions: int
    max_file_mb: int
    max_pages: int
    concurrent_uploads: int
    max_members: int
    priority: str
    features: List[str]


class JobDTO(BaseModel):
    id: uuid.UUID
    job_type: str
    status: str
    attempts: int
    max_attempts: int
    created_at: datetime
    last_error: Optional[str] = None


class DashboardDTO(BaseModel):
    usage: UsageSummaryDTO
    recent_documents: List[DocumentDTO]
    recent_conversations: List[ConversationDTO]
