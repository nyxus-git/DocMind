import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class UploadIntentRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    declared_mime: str = Field(min_length=3, max_length=128)
    size_bytes: int = Field(gt=0, le=20 * 1024 * 1024)  # 20 MB cap
    checksum_sha256: str = Field(min_length=64, max_length=64)


class UploadIntentResponse(BaseModel):
    document_id: uuid.UUID
    upload_url: str
    method: str = "PUT"
    headers: Dict[str, str]
    expires_at: str


class UploadCompleteResponse(BaseModel):
    document_id: uuid.UUID
    status: str
    job_id: uuid.UUID


class SafeErrorDTO(BaseModel):
    code: str
    message: str
    retryable: bool = False


class DocumentDTO(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    filename: str
    mime_type: str
    size_bytes: int
    checksum_short: str
    status: str
    page_count: int
    processing_version: int
    created_at: datetime
    updated_at: datetime
    ready_at: Optional[datetime] = None
    tags: List[str] = Field(default_factory=list)
    safe_error: Optional[SafeErrorDTO] = None


class DocumentUpdateDTO(BaseModel):
    filename: Optional[str] = Field(None, min_length=1, max_length=255)
    tags: Optional[List[str]] = None


class SignedDownloadResponse(BaseModel):
    download_url: str
    expires_at: str
