import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.schemas.chat import CitationDTO


class KeyPointItem(BaseModel):
    point: str
    explanation: str
    source_labels: List[str] = Field(default_factory=list)


class DocumentSummaryResponse(BaseModel):
    document_id: uuid.UUID
    overview: str
    sections: List[Dict[str, Any]] = Field(default_factory=list)
    key_points: List[KeyPointItem] = Field(default_factory=list)
    caveats: Optional[str] = None
    citations: List[CitationDTO] = Field(default_factory=list)
    is_cached: bool = False


class ExtractionPresetRequest(BaseModel):
    preset_id: str = Field(description="entities, dates, metrics, obligations, sections")


class ExtractionResponse(BaseModel):
    document_id: uuid.UUID
    preset_id: str
    extracted_data: Dict[str, Any]
    confidence_note: str
    citations: List[CitationDTO] = Field(default_factory=list)


class CompareDocumentsRequest(BaseModel):
    document_ids: List[uuid.UUID] = Field(min_length=2, max_length=5)
    focus_topic: Optional[str] = None


class CompareMatrixRow(BaseModel):
    attribute: str
    per_document_values: Dict[str, str]
    differences_summary: str
    source_labels: List[str] = Field(default_factory=list)


class CompareDocumentsResponse(BaseModel):
    document_ids: List[uuid.UUID]
    matrix: List[CompareMatrixRow]
    narrative_summary: str
    citations: List[CitationDTO] = Field(default_factory=list)
    limitations: Optional[str] = None
