import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from app.schemas.chat import CitationDTO


class CreateInsightRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    citations: List[CitationDTO] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)


class SavedInsightDTO(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    user_id: uuid.UUID
    title: str
    question: str
    answer: str
    citations: List[CitationDTO] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    created_at: datetime

