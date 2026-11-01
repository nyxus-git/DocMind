import json
import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.adapters.ai.base import LLMProvider
from app.adapters.ai.gemini import get_llm_provider
from app.core.config import settings
from app.core.exceptions import DocMindException, EntityNotFoundException
from app.models.entities import Document, DocumentChunk, DocumentSummary
from app.models.enums import DocumentStatus
from app.repositories.document import DocumentRepository
from app.schemas.chat import CitationDTO
from app.schemas.intelligence import (
    CompareDocumentsResponse,
    CompareMatrixRow,
    DocumentSummaryResponse,
    ExtractionResponse,
    KeyPointItem,
)


class IntelligenceService:
    def __init__(self, db: AsyncSession, llm: Optional[LLMProvider] = None):
        self.db = db
        self.doc_repo = DocumentRepository(db)
        self.llm = llm or get_llm_provider()

    async def get_or_generate_summary(
        self,
        workspace_id: uuid.UUID,
        document_id: uuid.UUID
    ) -> DocumentSummaryResponse:
        doc = await self.doc_repo.get_by_id(workspace_id, document_id)
        if not doc or doc.status != DocumentStatus.READY.value:
            raise EntityNotFoundException("Ready Document", document_id)

        prompt_version = "v1.0"
        
        # Check cache
        cache_query = select(DocumentSummary).where(
            DocumentSummary.document_id == document_id,
            DocumentSummary.processing_version == doc.processing_version,
            DocumentSummary.model == settings.LLM_MODEL,
            DocumentSummary.prompt_version == prompt_version
        )
        cached = (await self.db.execute(cache_query)).scalar_one_or_none()
        if cached:
            return DocumentSummaryResponse(
                document_id=doc.id,
                overview=cached.summary,
                key_points=[KeyPointItem(**kp) for kp in (cached.key_points or [])],
                is_cached=True
            )

        # Fetch document chunks for map-reduce summary
        chunks_res = await self.db.execute(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == doc.id)
            .order_by(DocumentChunk.chunk_index.asc())
            .limit(15)
        )
        chunks = list(chunks_res.scalars().all())

        context_text = "\n\n".join([f"[Chunk {c.chunk_index + 1}]:\n{c.content[:1000]}" for c in chunks])

        prompt = (
            f"Generate a comprehensive, factual summary of the following document '{doc.filename}'.\n\n"
            f"<document_content>\n{context_text}\n</document_content>\n\n"
            "Respond in JSON matching this schema:\n"
            "{\n"
            '  "overview": "Detailed executive overview of the document",\n'
            '  "key_points": [\n'
            '    {"point": "Key takeaway headline", "explanation": "Supporting facts from text", "source_labels": ["Chunk 1"]}\n'
            "  ],\n"
            '  "caveats": "Limitations or key assumptions stated in document"\n'
            "}"
        )

        res = await self.llm.generate(
            prompt=prompt,
            system_prompt="You are an expert document intelligence assistant summarizing user files accurately.",
            response_schema={"type": "object"}
        )

        overview = "Executive summary generated from document content."
        key_points_data = []
        caveats = None

        if res.parsed_json:
            overview = res.parsed_json.get("overview", overview)
            key_points_data = res.parsed_json.get("key_points", [])
            caveats = res.parsed_json.get("caveats")

        # Persist to cache
        summary_rec = DocumentSummary(
            workspace_id=workspace_id,
            document_id=doc.id,
            processing_version=doc.processing_version,
            model=settings.LLM_MODEL,
            prompt_version=prompt_version,
            summary=overview,
            key_points=key_points_data
        )
        self.db.add(summary_rec)
        await self.db.flush()

        return DocumentSummaryResponse(
            document_id=doc.id,
            overview=overview,
            key_points=[KeyPointItem(**kp) for kp in key_points_data],
            caveats=caveats,
            is_cached=False
        )

    async def compare_documents(
        self,
        workspace_id: uuid.UUID,
        document_ids: List[uuid.UUID],
        focus_topic: Optional[str] = None
    ) -> CompareDocumentsResponse:
        ready_docs = await self.doc_repo.get_ready_documents(workspace_id, document_ids)
        if len(ready_docs) < 2:
            raise DocMindException(
                status_code=400,
                code="INSUFFICIENT_DOCUMENTS",
                title="Comparison Requires Multiple Documents",
                detail="At least 2 READY documents must be selected for comparison."
            )

        doc_summaries = []
        for d in ready_docs:
            chunks = (await self.db.execute(
                select(DocumentChunk)
                .where(DocumentChunk.document_id == d.id)
                .limit(5)
            )).scalars().all()
            text = "\n".join([c.content[:600] for c in chunks])
            doc_summaries.append(f"=== Document: '{d.filename}' (ID: {d.id}) ===\n{text}")

        all_text = "\n\n".join(doc_summaries)
        topic_clause = f"Focus particularly on: {focus_topic}." if focus_topic else ""

        prompt = (
            f"Compare the following documents side-by-side. {topic_clause}\n\n"
            f"{all_text}\n\n"
            "Provide a structured comparison matrix in JSON with this exact schema:\n"
            "{\n"
            '  "narrative_summary": "High-level summary comparing the files",\n'
            '  "matrix": [\n'
            "    {\n"
            '      "attribute": "e.g. Scope, Pricing, Obligations, Metrics",\n'
            '      "per_document_values": {"doc_filename": "value"},\n'
            '      "differences_summary": "Key contrast between them"\n'
            "    }\n"
            "  ],\n"
            '  "limitations": "Notes on scope or missing data"\n'
            "}"
        )

        res = await self.llm.generate(
            prompt=prompt,
            system_prompt="You are an audit and comparative analysis AI. State facts accurately across files.",
            response_schema={"type": "object"}
        )

        narrative = "Comparative analysis across selected files."
        matrix = []
        limitations = None

        if res.parsed_json:
            narrative = res.parsed_json.get("narrative_summary", narrative)
            raw_matrix = res.parsed_json.get("matrix", [])
            for row in raw_matrix:
                matrix.append(CompareMatrixRow(
                    attribute=row.get("attribute", "Attribute"),
                    per_document_values=row.get("per_document_values", {}),
                    differences_summary=row.get("differences_summary", "")
                ))
            limitations = res.parsed_json.get("limitations")

        return CompareDocumentsResponse(
            document_ids=document_ids,
            matrix=matrix,
            narrative_summary=narrative,
            limitations=limitations
        )
