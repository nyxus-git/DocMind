import re
import uuid
from typing import Dict, List, Optional, Set, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import EntityNotFoundException
from app.models.entities import Document, DocumentChunk
from app.repositories.chunk import ChunkRepository
from app.repositories.document import DocumentRepository
from app.schemas.compliance import (
    ComplianceFindingItem,
    DocumentComplianceScanResponse,
    WorkspaceComplianceSummaryResponse,
)


def _luhn_checksum(card_number_str: str) -> bool:
    digits = [int(d) for d in card_number_str if d.isdigit()]
    if len(digits) < 13 or len(digits) > 19:
        return False
    checksum = 0
    reverse_digits = digits[::-1]
    for i, d in enumerate(reverse_digits):
        if i % 2 == 1:
            doubled = d * 2
            checksum += (doubled - 9) if doubled > 9 else doubled
        else:
            checksum += d
    return checksum % 10 == 0


class ComplianceScannerService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.doc_repo = DocumentRepository(db)
        self.chunk_repo = ChunkRepository(db)

    async def scan_document(
        self,
        workspace_id: uuid.UUID,
        document_id: uuid.UUID,
        allowed_space_ids: Optional[Set[uuid.UUID]] = None,
    ) -> DocumentComplianceScanResponse:
        doc = await self.doc_repo.get_by_id(workspace_id, document_id, allowed_space_ids=allowed_space_ids)
        if not doc:
            raise EntityNotFoundException("Document", document_id)

        chunks_res = await self.chunk_repo.get_chunks_for_document(document_id)
        findings: List[ComplianceFindingItem] = []
        recommendations: List[str] = []

        total_findings = 0
        risk_score = 0

        cc_pattern = re.compile(r"\b(?:\d{4}[ -]?){3}\d{4}\b")
        ssn_pattern = re.compile(r"\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b")
        api_key_pattern = re.compile(r"\b(sk_live_[0-9a-zA-Z]{20,}|ghp_[0-9a-zA-Z]{30,}|AIza[0-9A-Za-z-_]{30,}|AKIA[0-9A-Z]{16})\b")
        private_key_pattern = re.compile(r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----")
        phone_pattern = re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")
        email_pattern = re.compile(r"\b[A-Za-z0-9._%+-]+@(?!yourdomain\.com)[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b")
        confidential_pattern = re.compile(r"\b(STRICTLY CONFIDENTIAL|CONFIDENTIAL AND PROPRIETARY|DO NOT DISTRIBUTE|TOP SECRET)\b", re.IGNORECASE)

        seen_snippets = set()

        for chunk in chunks_res:
            text = chunk.content
            page = chunk.page_start or 1

            # 1. Private keys
            if private_key_pattern.search(text):
                total_findings += 1
                risk_score += 40
                findings.append(ComplianceFindingItem(
                    category="SECRET_CREDENTIAL",
                    severity="CRITICAL",
                    label="Cryptographic Private Key",
                    redacted_snippet="-----BEGIN PRIVATE KEY----- [REDACTED]",
                    page=page,
                    count=1
                ))
                if "Rotate exposed cryptographic keys immediately" not in recommendations:
                    recommendations.append("Rotate exposed cryptographic keys immediately and scrub from document store.")

            # 2. API Keys
            for match in api_key_pattern.finditer(text):
                secret_str = match.group(0)
                redacted = secret_str[:8] + "..." + secret_str[-4:]
                if redacted not in seen_snippets:
                    seen_snippets.add(redacted)
                    total_findings += 1
                    risk_score += 35
                    findings.append(ComplianceFindingItem(
                        category="SECRET_CREDENTIAL",
                        severity="CRITICAL",
                        label="Live API Key / Access Token",
                        redacted_snippet=redacted,
                        page=page,
                        count=1
                    ))
                    if "Revoke and rotate exposed live API credentials" not in recommendations:
                        recommendations.append("Revoke and rotate exposed live API credentials.")

            # 3. Credit Card
            for match in cc_pattern.finditer(text):
                raw_cc = match.group(0)
                clean_cc = re.sub(r"\D", "", raw_cc)
                if _luhn_checksum(clean_cc):
                    redacted = "**** **** **** " + clean_cc[-4:]
                    if redacted not in seen_snippets:
                        seen_snippets.add(redacted)
                        total_findings += 1
                        risk_score += 30
                        findings.append(ComplianceFindingItem(
                            category="FINANCIAL_DATA",
                            severity="HIGH",
                            label="Payment Card (PAN)",
                            redacted_snippet=redacted,
                            page=page,
                            count=1
                        ))
                        if "Redact payment card account numbers per PCI-DSS guidelines" not in recommendations:
                            recommendations.append("Redact payment card account numbers per PCI-DSS guidelines.")

            # 4. SSN
            for match in ssn_pattern.finditer(text):
                raw_ssn = match.group(0)
                redacted = "***-**-" + raw_ssn[-4:]
                if redacted not in seen_snippets:
                    seen_snippets.add(redacted)
                    total_findings += 1
                    risk_score += 30
                    findings.append(ComplianceFindingItem(
                        category="GOVERNMENT_ID",
                        severity="HIGH",
                        label="Social Security Number (SSN)",
                        redacted_snippet=redacted,
                        page=page,
                        count=1
                    ))
                    if "Anonymize employee and client Social Security Numbers" not in recommendations:
                        recommendations.append("Anonymize employee and client Social Security Numbers.")

            # 5. Confidential Notices
            conf_match = confidential_pattern.search(text)
            if conf_match and "CONF_NOTICE" not in seen_snippets:
                seen_snippets.add("CONF_NOTICE")
                total_findings += 1
                risk_score += 10
                findings.append(ComplianceFindingItem(
                    category="LEGAL_DISCLAIMER",
                    severity="MEDIUM",
                    label="Proprietary / Confidential Notice",
                    redacted_snippet=f"'{conf_match.group(0)}' marker detected",
                    page=page,
                    count=1
                ))
                if "Verify workspace members' NDA clearance before distributing this document" not in recommendations:
                    recommendations.append("Verify workspace members' NDA clearance before distributing this document.")

            # 6. Emails / Contact PII (limit to max 3 items to avoid clutter)
            for match in email_pattern.finditer(text):
                em = match.group(0)
                if "@example.com" not in em and "test" not in em and len(seen_snippets) < 20:
                    parts = em.split("@")
                    redacted_em = parts[0][:2] + "***@" + parts[1]
                    if redacted_em not in seen_snippets:
                        seen_snippets.add(redacted_em)
                        total_findings += 1
                        risk_score += 5
                        findings.append(ComplianceFindingItem(
                            category="CONTACT_PII",
                            severity="LOW",
                            label="Email Address (PII)",
                            redacted_snippet=redacted_em,
                            page=page,
                            count=1
                        ))

        # Determine level & final score
        final_score = min(100, risk_score)
        if final_score == 0:
            risk_level = "CLEAN"
            recommendations.append("No sensitive credentials, payment details, or government IDs detected.")
        elif final_score <= 25:
            risk_level = "LOW"
        elif final_score <= 60:
            risk_level = "MEDIUM"
        elif final_score <= 80:
            risk_level = "HIGH"
        else:
            risk_level = "CRITICAL"

        return DocumentComplianceScanResponse(
            document_id=doc.id,
            filename=doc.filename,
            risk_score=final_score,
            risk_level=risk_level,
            scanned_chunks=len(chunks_res),
            findings_count=len(findings),
            findings=findings,
            recommendations=recommendations
        )

    async def get_workspace_summary(self, workspace_id: uuid.UUID) -> WorkspaceComplianceSummaryResponse:
        docs = await self.doc_repo.list_documents(workspace_id=workspace_id, limit=100)
        total_docs = len(docs)
        clean_docs = 0
        at_risk_docs = 0
        critical_count = 0
        categories: Dict[str, int] = {
            "SECRET_CREDENTIAL": 0,
            "FINANCIAL_DATA": 0,
            "GOVERNMENT_ID": 0,
            "CONTACT_PII": 0,
            "LEGAL_DISCLAIMER": 0,
        }

        # Sample scan up to 20 documents for fast overview
        for d in docs[:20]:
            try:
                scan = await self.scan_document(workspace_id, d.id)
                if scan.risk_level == "CLEAN":
                    clean_docs += 1
                else:
                    at_risk_docs += 1
                for f in scan.findings:
                    if f.severity == "CRITICAL":
                        critical_count += 1
                    categories[f.category] = categories.get(f.category, 0) + 1
            except Exception:
                clean_docs += 1

        if total_docs > len(docs[:20]):
            clean_docs += (total_docs - len(docs[:20]))

        return WorkspaceComplianceSummaryResponse(
            workspace_id=workspace_id,
            total_documents=total_docs,
            clean_documents=clean_docs,
            at_risk_documents=at_risk_docs,
            critical_findings_count=critical_count,
            category_counts=categories
        )

