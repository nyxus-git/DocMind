import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CreateConversationRequest(BaseModel):
    title: Optional[str] = "New Conversation"
    scope_mode: str = "all"
    selected_doc_ids: List[uuid.UUID] = Field(default_factory=list)


class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None
    scope_mode: Optional[str] = None
    selected_doc_ids: Optional[List[uuid.UUID]] = None


class CitationDTO(BaseModel):
    citation_id: uuid.UUID
    document_id: uuid.UUID
    filename: str
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    section: Optional[str] = None
    excerpt: str
    source_label: str
    is_source_deleted: bool = False


class MessageDTO(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    status: str
    citations: List[CitationDTO] = Field(default_factory=list)
    created_at: datetime


class ConversationDTO(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    title: str
    scope_mode: str
    selected_doc_ids: List[uuid.UUID] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    messages: Optional[List[MessageDTO]] = None


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    document_ids: Optional[List[uuid.UUID]] = None
    response_mode: str = "source_only"
    idempotency_key: Optional[str] = None


class UsageDTO(BaseModel):
    input_tokens: int
    output_tokens: int


class SendMessageResponse(BaseModel):
    message_id: uuid.UUID
    role: str = "assistant"
    content: str
    insufficient_evidence: bool = False
    citations: List[CitationDTO] = Field(default_factory=list)
    usage: UsageDTO
    suggested_followups: List[str] = Field(default_factory=list)
    created_at: datetime


class ContentSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    document_ids: Optional[List[uuid.UUID]] = None
    limit: int = Field(default=10, ge=1, le=50)


class SearchResultItemDTO(BaseModel):
    document_id: uuid.UUID
    filename: str
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    section: Optional[str] = None
    snippet: str
    score: float


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResultItemDTO]
    total_found: int
