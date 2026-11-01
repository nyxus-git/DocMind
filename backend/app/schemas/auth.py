import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


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


class UserSummaryDTO(BaseModel):
    id: uuid.UUID
    email: str
    status: str
    verified: bool
    active_workspace: Optional[WorkspaceSummaryDTO] = None


class UserProfileDTO(BaseModel):
    id: uuid.UUID
    email: str
    status: str
    verified: bool
    created_at: datetime
    active_workspace: Optional[WorkspaceSummaryDTO] = None


class UpdateProfileRequest(BaseModel):
    email: Optional[EmailStr] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)
