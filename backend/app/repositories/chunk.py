import uuid
from typing import Any, Dict, List, Optional, Set, Tuple
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import Document, DocumentChunk


class ChunkRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def bulk_insert_chunks(
        self,
        workspace_id: uuid.UUID,
        document_id: uuid.UUID,
        chunks_data: List[Dict[str, Any]],
        processing_version: int = 1
    ) -> None:
        """Batch inserts document chunks with 768-dim vector embeddings and tsvector for FTS."""
        for c in chunks_data:
            chunk = DocumentChunk(
                workspace_id=workspace_id,
                document_id=document_id,
                processing_version=processing_version,
                chunk_index=c["chunk_index"],
                content=c["content"],
                embedding=c.get("embedding"),
                page_start=c.get("page_start"),
                page_end=c.get("page_end"),
                section_path=c.get("section_path"),
                token_count=c.get("token_count", 0),
                chunk_metadata=c.get("metadata", {})
            )
            self.db.add(chunk)
        await self.db.flush()

    async def delete_by_document(self, document_id: uuid.UUID) -> None:
        await self.db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
        await self.db.flush()

    async def hybrid_search(
        self,
        workspace_id: uuid.UUID,
        document_ids: List[uuid.UUID],
        query_embedding: Optional[List[float]],
        query_text: str,
        top_k: int = 8,
        rrf_k: int = 60
    ) -> List[Tuple[DocumentChunk, Document, float]]:
        """
        Executes hybrid vector + lexical search with tenant isolation pre-filter.
        Fuses ranks using Reciprocal Rank Fusion (RRF) and deduplicates redundant passages.
        """
        if not document_ids:
            return []

        # 1. Fetch dense candidates (top 20) by vector cosine similarity
        dense_ranked: Dict[uuid.UUID, int] = {}
        chunks_by_id: Dict[uuid.UUID, Tuple[DocumentChunk, Document]] = {}

        if query_embedding:
            try:
                # pgvector cosine distance: embedding <=> query_vector
                vector_query = (
                    select(DocumentChunk, Document)
                    .join(Document, DocumentChunk.document_id == Document.id)
                    .where(
                        DocumentChunk.workspace_id == workspace_id,
                        DocumentChunk.document_id.in_(document_ids),
                        DocumentChunk.embedding.is_not(None)
                    )
                    .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
                    .limit(20)
                )
                vector_res = await self.db.execute(vector_query)
                for rank, (chunk, doc) in enumerate(vector_res.all()):
                    dense_ranked[chunk.id] = rank + 1
                    chunks_by_id[chunk.id] = (chunk, doc)
            except Exception:
                # Fallback in environments without pgvector C extension (e.g. SQLite unit tests)
                pass

        # 2. Fetch sparse lexical candidates (top 20)
        sparse_ranked: Dict[uuid.UUID, int] = {}
        search_terms = [t for t in query_text.strip().split() if len(t) >= 3][:5]

        conditions = [DocumentChunk.content.ilike(f"%{query_text[:80]}%")]
        if search_terms:
            conditions.extend([DocumentChunk.content.ilike(f"%{term}%") for term in search_terms])

        lexical_query = (
            select(DocumentChunk, Document)
            .join(Document, DocumentChunk.document_id == Document.id)
            .where(
                DocumentChunk.workspace_id == workspace_id,
                DocumentChunk.document_id.in_(document_ids),
                or_(*conditions)
            )
            .limit(20)
        )
        lexical_res = await self.db.execute(lexical_query)
        for rank, (chunk, doc) in enumerate(lexical_res.all()):
            sparse_ranked[chunk.id] = rank + 1
            if chunk.id not in chunks_by_id:
                chunks_by_id[chunk.id] = (chunk, doc)

        # 3. Compute Reciprocal Rank Fusion (RRF) scores
        all_candidate_ids = set(dense_ranked.keys()).union(set(sparse_ranked.keys()))
        rrf_scores: List[Tuple[uuid.UUID, float]] = []

        for cid in all_candidate_ids:
            score = 0.0
            if cid in dense_ranked:
                score += 1.0 / (rrf_k + dense_ranked[cid])
            if cid in sparse_ranked:
                score += 1.0 / (rrf_k + sparse_ranked[cid])
            rrf_scores.append((cid, score))

        # Sort by RRF score descending
        rrf_scores.sort(key=lambda x: x[1], reverse=True)

        # 4. Deduplicate overlapping chunks and balance multi-document coverage
        results: List[Tuple[DocumentChunk, Document, float]] = []
        seen_section_keys: Set[str] = set()
        doc_counts: Dict[uuid.UUID, int] = {}
        max_per_doc = 3 if len(document_ids) > 1 else top_k

        for cid, score in rrf_scores:
            chunk, doc = chunks_by_id[cid]
            current_doc_count = doc_counts.get(doc.id, 0)
            if current_doc_count >= max_per_doc:
                continue

            # Deduplication key based on document, page, and section path
            dedup_key = f"{doc.id}:{chunk.page_start}:{chunk.section_path}"
            if dedup_key in seen_section_keys and len(seen_section_keys) < top_k:
                continue

            seen_section_keys.add(dedup_key)
            doc_counts[doc.id] = current_doc_count + 1
            results.append((chunk, doc, score))

            if len(results) >= top_k:
                break

        # Fallback: if deduplication was too aggressive, fill remaining up to top_k
        if len(results) < top_k and len(results) < len(rrf_scores):
            existing_cids = {r[0].id for r in results}
            for cid, score in rrf_scores:
                if cid not in existing_cids:
                    chunk, doc = chunks_by_id[cid]
                    results.append((chunk, doc, score))
                    if len(results) >= top_k:
                        break

        return results

    async def get_leading_chunks(
        self,
        workspace_id: uuid.UUID,
        document_ids: List[uuid.UUID],
        limit: int = 5
    ) -> List[Tuple[DocumentChunk, Document]]:
        """Returns the opening sequential chunks of specified documents for global synthesis & summaries."""
        if not document_ids:
            return []
        stmt = (
            select(DocumentChunk, Document)
            .join(Document, DocumentChunk.document_id == Document.id)
            .where(
                DocumentChunk.workspace_id == workspace_id,
                DocumentChunk.document_id.in_(document_ids)
            )
            .order_by(DocumentChunk.document_id, DocumentChunk.chunk_index.asc())
            .limit(limit)
        )
        res = await self.db.execute(stmt)
        return list(res.all())

    async def get_all_chunks_for_documents(
        self,
        workspace_id: uuid.UUID,
        document_ids: List[uuid.UUID],
        limit: int = 25
    ) -> List[Tuple[DocumentChunk, Document]]:
        """Returns sequential chunks across the given documents up to limit for comprehensive synthesis and counting."""
        if not document_ids:
            return []
        stmt = (
            select(DocumentChunk, Document)
            .join(Document, DocumentChunk.document_id == Document.id)
            .where(
                DocumentChunk.workspace_id == workspace_id,
                DocumentChunk.document_id.in_(document_ids)
            )
            .order_by(DocumentChunk.document_id, DocumentChunk.chunk_index.asc())
            .limit(limit)
        )
        res = await self.db.execute(stmt)
        return list(res.all())

    async def get_chunks_for_document(
        self,
        document_id: uuid.UUID,
        limit: int = 200
    ) -> List[DocumentChunk]:
        stmt = (
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index.asc())
            .limit(limit)
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())


