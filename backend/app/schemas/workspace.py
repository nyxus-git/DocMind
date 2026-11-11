import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, EmailStr, Field


class CreateCompanyWorkspaceRequest(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    slug: Optional[str] = Field(None, min_length=2, max_length=128)
    tier: Optional[str] = Field(default="PRO", description="STARTER, PRO, ENTERPRISE")


class WorkspaceMemberDTO(BaseModel):
    user_id: uuid.UUID
    email: str
    role: str
    joined_at: datetime


class InviteMemberRequest(BaseModel):
    email: EmailStr
    role: str = Field(default="MEMBER")


class InviteMemberResponse(BaseModel):
    workspace_id: uuid.UUID
    email: str
    role: str
    status: str
    message: str


class UpdateMemberRoleRequest(BaseModel):
    role: str


class UpdateWorkspaceTierRequest(BaseModel):
    tier: str = Field(description="STARTER, PRO, ENTERPRISE")


class WorkspaceDetailDTO(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    tier: str = "STARTER"
    workspace_type: str = "PERSONAL"
    role: str
    created_at: datetime
    member_count: int = 1


class AuditEventDTO(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    actor_user_id: Optional[uuid.UUID]
    actor_email: Optional[str] = None
    action: str
    target_type: str
    target_id: Optional[uuid.UUID]
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime


class UpdateWorkspaceRequest(BaseModel):
    name: str = Field(min_length=2, max_length=128)


class TransferOwnershipRequest(BaseModel):
    new_owner_user_id: uuid.UUID


class PendingInviteDTO(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    email: str
    role: str
    status: str
    expires_at: datetime
    created_at: datetime


class CreateApiKeyRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    scopes: List[str] = Field(default_factory=lambda: ["read", "write"])


class ApiKeyDTO(BaseModel):
    id: uuid.UUID
    name: str
    key_prefix: str
    scopes: List[str]
    last_used_at: Optional[datetime] = None
    created_at: datetime


class CreateApiKeyResponse(ApiKeyDTO):
    secret_key: str
