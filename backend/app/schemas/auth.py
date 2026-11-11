import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    account_type: str = Field(default="personal", description="personal | company | employee")
    company_name: Optional[str] = Field(default=None, min_length=2, max_length=128)
    company_slug: Optional[str] = Field(default=None, min_length=2, max_length=128)
    target_company_slug: Optional[str] = Field(default=None, max_length=128)
    claim_domain: bool = False
    department_note: Optional[str] = Field(default=None, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailRequest(BaseModel):
    token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class WorkspaceSummaryDTO(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    role: str
    workspace_type: str = "PERSONAL"


class PendingJoinRequestDTO(BaseModel):
    workspace_id: uuid.UUID
    company_name: str
    company_slug: Optional[str] = None
    status: str = "PENDING"
    created_at: datetime


class CompanyPortalPublicDTO(BaseModel):
    exists: bool = True
    company_name: str
    slug: str
    join_policy: str
    allowed_domains: List[str] = Field(default_factory=list)


class PortalAccessRequestBody(BaseModel):
    department_note: Optional[str] = Field(default=None, max_length=200)


class PortalAccessRequestResult(BaseModel):
    status: str
    company_name: str
    slug: str
    role: Optional[str] = None


class CompanyDomainLookupDTO(BaseModel):
    matched: bool
    workspace_id: Optional[uuid.UUID] = None
    company_name: Optional[str] = None
    slug: Optional[str] = None
    domain: Optional[str] = None
    join_policy: Optional[str] = None


class UserSummaryDTO(BaseModel):
    id: uuid.UUID
    email: str
    status: str
    verified: bool
    is_superadmin: bool = False
    active_workspace: Optional[WorkspaceSummaryDTO] = None
    pending_join_request: Optional[PendingJoinRequestDTO] = None


class UserProfileDTO(BaseModel):
    id: uuid.UUID
    email: str
    status: str
    verified: bool
    is_superadmin: bool = False
    created_at: datetime
    active_workspace: Optional[WorkspaceSummaryDTO] = None
    pending_join_request: Optional[PendingJoinRequestDTO] = None


class UpdateProfileRequest(BaseModel):
    email: Optional[EmailStr] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)
