import uuid
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class ComplianceFindingItem(BaseModel):
    category: str = Field(description="FINANCIAL_DATA, GOVERNMENT_ID, SECRET_CREDENTIAL, CONTACT_PII, LEGAL_DISCLAIMER")
    severity: str = Field(description="CRITICAL, HIGH, MEDIUM, LOW")
    label: str
    redacted_snippet: str
    page: Optional[int] = None
    count: int = 1


class DocumentComplianceScanResponse(BaseModel):
    document_id: uuid.UUID
    filename: str
    risk_score: int = Field(ge=0, le=100, description="0 is clean, 100 is critical risk")
    risk_level: str = Field(description="CLEAN, LOW, MEDIUM, HIGH, CRITICAL")
    scanned_chunks: int
    findings_count: int
    findings: List[ComplianceFindingItem] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)


class WorkspaceComplianceSummaryResponse(BaseModel):
    workspace_id: uuid.UUID
    total_documents: int
    clean_documents: int
    at_risk_documents: int
    critical_findings_count: int
    category_counts: Dict[str, int] = Field(default_factory=dict)

