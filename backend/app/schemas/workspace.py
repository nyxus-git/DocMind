import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class CreateCompanyWorkspaceRequest(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    slug: Optional[str] = Field(None, min_length=2, max_length=128)


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


class WorkspaceDetailDTO(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    role: str
    created_at: datetime
    member_count: int = 1

