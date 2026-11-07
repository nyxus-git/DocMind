from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel


class AdminOverviewDTO(BaseModel):
    total_workspaces: int
    total_users: int
    total_documents: int
    total_chunks: int
    total_storage_bytes: int
    total_questions: int
    active_tiers: Dict[str, int]
    document_status_breakdown: Dict[str, int]
    worker_health: str
    cloudflare_r2_status: str
    gemini_api_status: str
    smtp_status: str


class AdminWorkspaceSummaryDTO(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    tier: str
    created_at: datetime
    owner_email: Optional[str] = None
    member_count: int
    document_count: int
    storage_bytes: int


class AdminDocumentSummaryDTO(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    workspace_name: str
    filename: str
    mime_type: str
    size_bytes: int
    status: str
    page_count: int
    created_at: datetime
    error_code: Optional[str] = None
    error_message: Optional[str] = None


class AdminSystemDiagnosticsDTO(BaseModel):
    app_env: str
    storage_provider: str
    r2_bucket: str
    llm_provider: str
    llm_model: str
    embedding_model: str
    embedding_dimension: int
    email_enabled: bool
    smtp_host: str
    smtp_from_email: str
    worker_concurrency: int
    public_app_url: str
    api_base_url: str

