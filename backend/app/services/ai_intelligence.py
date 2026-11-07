import json
import logging
import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.adapters.ai.base import EmbeddingProvider, LLMProvider
from app.adapters.ai.gemini import get_embedding_provider, get_llm_provider
from app.core.config import settings
from app.core.exceptions import DocMindException, EntityNotFoundException
from app.models.entities import Document, DocumentChunk, DocumentSummary
from app.models.enums import DocumentStatus
from app.repositories.chunk import ChunkRepository
from app.repositories.document import DocumentRepository
from app.repositories.usage import UsageRepository
from app.schemas.chat import CitationDTO
from app.schemas.intelligence import (
    CompareDocumentsResponse,
    CompareMatrixRow,
    DocumentSummaryResponse,
    ExtractionResponse,
    KeyPointItem,
)

logger = logging.getLogger("docmind.intelligence")


class IntelligenceService:
    def __init__(
        self,
        db: AsyncSession,
        llm: Optional[LLMProvider] = None,
        embedder: Optional[EmbeddingProvider] = None
    ):
        self.db = db
        self.doc_repo = DocumentRepository(db)
        self.chunk_repo = ChunkRepository(db)
        self.usage_repo = UsageRepository(db)
        self.llm = llm or get_llm_provider()
        self.embedder = embedder or get_embedding_provider()

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

        # Fetch document chunks for summary synthesis
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

    async def extract_preset(
        self,
        workspace_id: uuid.UUID,
        document_id: uuid.UUID,
        preset_id: str,
        user_id: Optional[uuid.UUID] = None
    ) -> ExtractionResponse:
        doc = await self.doc_repo.get_by_id(workspace_id, document_id)
        if not doc or doc.status != DocumentStatus.READY.value:
            raise EntityNotFoundException("Ready Document", document_id)

        # Retrieve chunks for document
        chunks_res = await self.db.execute(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == doc.id)
            .order_by(DocumentChunk.chunk_index.asc())
            .limit(10)
        )
        chunks = list(chunks_res.scalars().all())

        citation_map: Dict[str, CitationDTO] = {}
        chunk_texts: List[str] = []
        for i, c in enumerate(chunks, start=1):
            lbl = f"S{i}"
            citation_map[lbl] = CitationDTO(
                citation_id=uuid.uuid4(),
                document_id=doc.id,
                filename=doc.filename,
                page_start=c.page_start or 1,
                page_end=c.page_end or 1,
                section=c.section_path or "General",
                excerpt=c.content[:250].strip(),
                source_label=lbl
            )
            chunk_texts.append(f"[{lbl}] Page {c.page_start or 1}:\n{c.content[:900]}")

        context_str = "\n\n".join(chunk_texts)
        preset_prompts = {
            "entities": "Extract all key entities, including people, organizations, company names, and locations.",
            "dates": "Extract all critical dates, milestones, deadlines, execution dates, and renewal periods.",
            "metrics": "Extract all key metrics, financial amounts, percentages, quantities, and performance metrics.",
            "obligations": "Extract all contractual obligations, affirmative and negative covenants, and deliverables.",
            "sections": "Extract structural sections, article headings, and major document subdivisions."
        }
        instruction = preset_prompts.get(preset_id, f"Extract structured data corresponding to: {preset_id}")

        prompt = (
            f"Perform structured data extraction for document '{doc.filename}' based on preset '{preset_id}'.\n"
            f"Extraction target: {instruction}\n\n"
            f"<document_content>\n{context_str}\n</document_content>\n\n"
            "Return JSON with schema:\n"
            "{\n"
            '  "extracted_data": { ... },\n'
            '  "confidence_note": "Factual assessment of extraction completeness",\n'
            '  "source_labels": ["S1", "S2"]\n'
            "}"
        )

        res = await self.llm.generate(
            prompt=prompt,
            system_prompt="You are an enterprise document extraction system. Return strictly verified schema JSON.",
            response_schema={"type": "object"}
        )

        extracted: Dict[str, Any] = {}
        confidence_note = "Extracted from verified source passages."
        cited: List[CitationDTO] = []

        if res.parsed_json:
            extracted = res.parsed_json.get("extracted_data", {})
            confidence_note = res.parsed_json.get("confidence_note", confidence_note)
            for lbl in res.parsed_json.get("source_labels", []):
                if lbl in citation_map:
                    cited.append(citation_map[lbl])

        if not cited:
            cited = list(citation_map.values())[:5]

        if user_id:
            try:
                await self.usage_repo.record_event(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    event_type="extraction",
                    provider="gemini",
                    model=res.model,
                    units=res.input_tokens + res.output_tokens
                )
            except Exception as e:
                logger.warning(f"Failed to record usage event: {e}")

        return ExtractionResponse(
            document_id=doc.id,
            preset_id=preset_id,
            extracted_data=extracted,
            confidence_note=confidence_note,
            citations=cited
        )

    async def compare_documents(
        self,
        workspace_id: uuid.UUID,
        document_ids: List[uuid.UUID],
        focus_topic: Optional[str] = None,
        user_id: Optional[uuid.UUID] = None
    ) -> CompareDocumentsResponse:
        # 1. Enforce document count limits: 2 to 5 distinct documents
        unique_ids = list(dict.fromkeys(document_ids))
        if len(unique_ids) < 2 or len(unique_ids) > 5:
            raise DocMindException(
                status_code=400,
                code="INVALID_DOCUMENT_COUNT",
                title="Invalid Document Count",
                detail="Document comparison requires selecting between 2 and 5 distinct documents."
            )

        # 2. Verify all documents exist within workspace (prevent scope widening / leaking)
        docs_res = await self.db.execute(
            select(Document).where(
                Document.workspace_id == workspace_id,
                Document.id.in_(unique_ids)
            )
        )
        found_docs_list = list(docs_res.scalars().all())
        found_docs_map = {d.id: d for d in found_docs_list}

        missing_ids = [did for did in unique_ids if did not in found_docs_map]
        if missing_ids:
            raise DocMindException(
                status_code=404,
                code="DOCUMENTS_NOT_FOUND",
                title="Documents Not Found",
                detail=f"{len(missing_ids)} of the requested documents do not exist or are not accessible in this workspace."
            )

        # 3. Verify all documents are in READY state
        ordered_docs = [found_docs_map[did] for did in unique_ids]
        not_ready = [d for d in ordered_docs if d.status != DocumentStatus.READY.value]
        if not_ready:
            raise DocMindException(
                status_code=400,
                code="DOCUMENTS_NOT_READY",
                title="Documents Not Ready",
                detail=f"Document '{not_ready[0].filename}' is not in READY state (status: {not_ready[0].status}). All documents must be fully processed before comparison."
            )

        # 4. Multi-document evidence retrieval
        weak_extraction_warnings: List[str] = []
        citation_map: Dict[str, CitationDTO] = {}
        doc_evidence_blocks: List[str] = []
        source_counter = 1

        # Query embedding if focus_topic is provided
        focus_emb = None
        if focus_topic and focus_topic.strip():
            try:
                focus_emb = await self.embedder.embed_query(focus_topic.strip())
            except Exception:
                focus_emb = None

        for idx, doc in enumerate(ordered_docs, start=1):
            chunks: List[DocumentChunk] = []

            # If focus topic provided, retrieve top relevant chunks via hybrid search
            if focus_topic and focus_topic.strip():
                try:
                    search_res = await self.chunk_repo.hybrid_search(
                        workspace_id=workspace_id,
                        document_ids=[doc.id],
                        query_embedding=focus_emb,
                        query_text=focus_topic.strip(),
                        top_k=4
                    )
                    chunks = [chunk for chunk, _, _ in search_res]
                except Exception:
                    chunks = []

            # Fallback to ordered representative chunks if hybrid search had no results
            if not chunks:
                c_res = await self.db.execute(
                    select(DocumentChunk)
                    .where(DocumentChunk.document_id == doc.id)
                    .order_by(DocumentChunk.chunk_index.asc())
                    .limit(4)
                )
                chunks = list(c_res.scalars().all())

            # Detect weak extraction or empty document text
            total_doc_text_len = sum(len(c.content) for c in chunks)
            if len(chunks) == 0 or total_doc_text_len < 100:
                weak_extraction_warnings.append(
                    f"Document '{doc.filename}' yielded minimal extractable text ({total_doc_text_len} chars), which may limit comparative depth."
                )

            # Build evidence block for this document
            chunk_blocks: List[str] = []
            for c in chunks:
                label = f"S{source_counter}"
                source_counter += 1
                citation_map[label] = CitationDTO(
                    citation_id=uuid.uuid4(),
                    document_id=doc.id,
                    filename=doc.filename,
                    page_start=c.page_start or 1,
                    page_end=c.page_end or 1,
                    section=c.section_path or f"Page {c.page_start or 1}",
                    excerpt=c.content[:250].strip(),
                    source_label=label
                )
                chunk_blocks.append(
                    f"[{label}] (Page {c.page_start or 1}, Section: {c.section_path or 'General'}):\n{c.content[:1000]}"
                )

            doc_evidence_blocks.append(
                f'=== Document [{idx}]: "{doc.filename}" (ID: {doc.id}) ===\n' + "\n\n".join(chunk_blocks)
            )

        all_evidence = "\n\n".join(doc_evidence_blocks)
        topic_clause = f"Focus the comparative synthesis around: '{focus_topic.strip()}'." if focus_topic and focus_topic.strip() else ""

        # 5. Formulate prompt with JSON schema
        prompt = (
            f"Compare the following {len(ordered_docs)} documents side-by-side based on the verified evidence bundle.\n"
            f"{topic_clause}\n\n"
            f"<comparative_evidence>\n{all_evidence}\n</comparative_evidence>\n\n"
            "Requirements:\n"
            "1. Synthesize an executive narrative comparing key commonalities, discrepancies, and unique attributes across the files.\n"
            "2. Construct a comparison matrix of 4 to 8 critical attributes.\n"
            "   For each attribute:\n"
            "   - 'attribute': Name of the clause, specification, or category (e.g., Liability Cap, Termination Notice, SLA Guarantee, Payment Terms).\n"
            "   - 'per_document_values': Map each EXACT document filename to its stated value or position (use 'Not specified' if unmentioned).\n"
            "   - 'differences_summary': Concise analysis highlighting the contrast or alignment.\n"
            "   - 'source_labels': Array of source tags (e.g. ['S1', 'S3']) from the evidence bundle supporting this finding.\n"
            "3. Identify any critical limitations, gaps, or scope mismatches in 'limitations'.\n\n"
            "Respond in JSON matching this schema:\n"
            "{\n"
            '  "narrative_summary": "High-level executive comparison summary...",\n'
            '  "matrix": [\n'
            "    {\n"
            '      "attribute": "Attribute Name",\n'
            '      "per_document_values": {"doc-1.pdf": "...", "doc-2.pdf": "..."},\n'
            '      "differences_summary": "Contrast explanation...",\n'
            '      "source_labels": ["S1", "S2"]\n'
            "    }\n"
            "  ],\n"
            '  "limitations": "Notes on scope or missing data..."\n'
            "}"
        )

        system_prompt = (
            "You are a rigorous enterprise document audit and comparative analysis AI. "
            "Extract and compare facts strictly from the provided source evidence. "
            "Never fabricate facts or cite unlisted sources."
        )

        res = await self.llm.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            response_schema={"type": "object"},
            max_tokens=2500
        )

        narrative = "Comparative matrix generated across selected documents."
        matrix_rows: List[CompareMatrixRow] = []
        limitations: Optional[str] = None
        referenced_labels = set()

        if res.parsed_json:
            narrative = res.parsed_json.get("narrative_summary", narrative)
            raw_matrix = res.parsed_json.get("matrix", [])
            for row in raw_matrix:
                raw_labels = row.get("source_labels", [])
                # Filter out hallucinated source labels not present in evidence bundle
                valid_labels = [lbl for lbl in raw_labels if lbl in citation_map]
                referenced_labels.update(valid_labels)

                # Ensure all compared document filenames have an entry in per_document_values
                per_doc_vals = row.get("per_document_values", {})
                for doc in ordered_docs:
                    if doc.filename not in per_doc_vals:
                        # Best effort match if model normalized filename
                        matched = next((v for k, v in per_doc_vals.items() if k in doc.filename or doc.filename in k), "Not addressed")
                        per_doc_vals[doc.filename] = matched

                matrix_rows.append(CompareMatrixRow(
                    attribute=row.get("attribute", "Attribute"),
                    per_document_values=per_doc_vals,
                    differences_summary=row.get("differences_summary", ""),
                    source_labels=valid_labels
                ))

            limitations = res.parsed_json.get("limitations")

        # Append any weak extraction warnings into limitations
        if weak_extraction_warnings:
            weak_text = " ".join(weak_extraction_warnings)
            limitations = f"{limitations} {weak_text}".strip() if limitations else weak_text

        # Collect citations referenced in matrix (or all retrieved citations if none cited)
        citations_to_return: List[CitationDTO] = []
        if referenced_labels:
            citations_to_return = [citation_map[lbl] for lbl in sorted(referenced_labels) if lbl in citation_map]
        else:
            citations_to_return = list(citation_map.values())[:10]

        # Record usage event if user_id provided
        if user_id:
            try:
                await self.usage_repo.record_event(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    event_type="comparison",
                    provider="gemini",
                    model=res.model,
                    units=res.input_tokens + res.output_tokens
                )
            except Exception as e:
                logger.warning(f"Failed to record usage event: {e}")

        return CompareDocumentsResponse(
            document_ids=unique_ids,
            matrix=matrix_rows,
            narrative_summary=narrative,
            citations=citations_to_return,
            limitations=limitations
        )
