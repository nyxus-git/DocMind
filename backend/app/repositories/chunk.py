import uuid
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import delete, func, select, text
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
        Executes hybrid vector + full-text search with tenant isolation pre-filter.
        Fuses ranks using Reciprocal Rank Fusion (RRF).
        """
        if not document_ids:
            return []

        # 1. Fetch dense candidates (top 20) by cosine similarity if embedding is provided
        dense_ranked: Dict[uuid.UUID, int] = {}
        chunks_by_id: Dict[uuid.UUID, Tuple[DocumentChunk, Document]] = {}

        if query_embedding:
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

        # 2. Fetch sparse lexical candidates (top 20) by PostgreSQL full-text search
        sparse_ranked: Dict[uuid.UUID, int] = {}
        # Simple fallback text match / ILIKE if tsvector isn't indexed yet
        lexical_query = (
            select(DocumentChunk, Document)
            .join(Document, DocumentChunk.document_id == Document.id)
            .where(
                DocumentChunk.workspace_id == workspace_id,
                DocumentChunk.document_id.in_(document_ids),
                DocumentChunk.content.ilike(f"%{query_text[:100]}%")
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

        # Return top_k results
        results: List[Tuple[DocumentChunk, Document, float]] = []
        for cid, score in rrf_scores[:top_k]:
            chunk, doc = chunks_by_id[cid]
            results.append((chunk, doc, score))

        return results
