import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, HttpUrl


class CreateWebhookRequest(BaseModel):
    url: str = Field(min_length=8, max_length=512)
    description: Optional[str] = Field(default=None, max_length=255)
    events: List[str] = Field(default_factory=lambda: ["document.ready", "document.failed"])


class WebhookDTO(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    url: str
    description: Optional[str] = None
    events: List[str] = Field(default_factory=list)
    is_active: bool
    last_triggered_at: Optional[datetime] = None
    failure_count: int
    created_at: datetime


class WebhookCreatedDTO(WebhookDTO):
    secret: str


class WebhookTestPingResponse(BaseModel):
    webhook_id: uuid.UUID
    success: bool
    status_code: int
    response_preview: str
    latency_ms: int

