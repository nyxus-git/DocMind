import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field


class KnowledgeSpaceDTO(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    slug: str
    description: Optional[str] = None
    visibility: str = "ALL_MEMBERS"
    allowed_roles: List[str] = Field(default_factory=list)
    member_user_ids: List[uuid.UUID] = Field(default_factory=list)
    document_count: int = 0
    created_at: datetime


class CreateSpaceRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    visibility: str = Field(default="ALL_MEMBERS", description="ALL_MEMBERS | RESTRICTED")
    allowed_roles: List[str] = Field(default_factory=lambda: ["OWNER", "ADMIN"])
    member_user_ids: List[uuid.UUID] = Field(default_factory=list)


class UpdateSpaceRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    visibility: Optional[str] = None
    allowed_roles: Optional[List[str]] = None
    member_user_ids: Optional[List[uuid.UUID]] = None


class CompanyJoinRequestDTO(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    user_id: uuid.UUID
    email: str
    department_note: Optional[str] = None
    status: str
    assigned_role: str
    created_at: datetime
    reviewed_at: Optional[datetime] = None


class DecideJoinRequestRequest(BaseModel):
    decision: str = Field(description="APPROVE | REJECT")
    role: str = Field(default="EMPLOYEE", description="ADMIN | MEMBER | EMPLOYEE | VIEWER")
    space_ids: Optional[List[uuid.UUID]] = None


class CompanySettingsDTO(BaseModel):
    workspace_id: uuid.UUID
    name: str
    slug: str
    tier: str
    workspace_type: str
    allowed_domains: List[str] = Field(default_factory=list)
    join_policy: str
    default_join_role: str
    starter_prompts: List[str] = Field(default_factory=list)


class UpdateCompanySettingsRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=128)
    allowed_domains: Optional[List[str]] = None
    join_policy: Optional[str] = Field(default=None, description="INVITE_ONLY | DOMAIN_APPROVAL | DOMAIN_AUTO_JOIN")
    default_join_role: Optional[str] = Field(default=None, description="EMPLOYEE | MEMBER | VIEWER")
    starter_prompts: Optional[List[str]] = None


class BulkInviteRequest(BaseModel):
    emails: List[EmailStr]
    role: str = Field(default="EMPLOYEE")


class BulkInviteResultItem(BaseModel):
    email: str
    status: str
    detail: str


class BulkInviteResponse(BaseModel):
    results: List[BulkInviteResultItem]
    invited_count: int
    added_count: int
    skipped_count: int


class KnowledgeGapDTO(BaseModel):
    id: uuid.UUID
    message_id: uuid.UUID
    conversation_id: uuid.UUID
    question: str
    answer_excerpt: str
    reason: str
    comment: Optional[str] = None
    user_email: str
    created_at: datetime


class CompanyOverviewDTO(BaseModel):
    workspace_id: uuid.UUID
    company_name: str
    slug: str
    tier: str
    member_count: int
    pending_join_requests: int
    total_documents: int
    ready_documents: int
    storage_bytes: int
    monthly_questions: int
    monthly_questions_limit: int
    helpful_rate_pct: Optional[float] = None
    total_feedback_count: int = 0
    spaces_count: int = 0
    recent_gaps: List[KnowledgeGapDTO] = Field(default_factory=list)


class EmployeePortalInfoDTO(BaseModel):
    workspace_id: Optional[uuid.UUID] = None
    company_name: str
    workspace_type: str = "COMPANY"
    role: str
    starter_prompts: List[str] = Field(default_factory=list)
    spaces: List[KnowledgeSpaceDTO] = Field(default_factory=list)
    pending_company_name: Optional[str] = None

