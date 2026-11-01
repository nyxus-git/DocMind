import hashlib
import logging
import os
import uuid
from typing import Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from app.adapters.ai.base import EmbeddingProvider
from app.adapters.ai.gemini import get_embedding_provider
from app.adapters.storage.base import ObjectStorage
from app.adapters.storage.local import get_storage
from app.core.exceptions import DocMindException
from app.ingestion.chunker import StructureAwareChunker
from app.ingestion.parsers.docx import parse_docx
from app.ingestion.parsers.pdf import parse_pdf
from app.ingestion.parsers.txt import parse_markdown, parse_text
from app.ingestion.validator import verify_file_content
from app.models.enums import DocumentErrorCode, DocumentStatus
from app.repositories.chunk import ChunkRepository
from app.repositories.document import DocumentRepository

logger = logging.getLogger("docmind.worker.ingest")


async def handle_ingest_job(
    db: AsyncSession,
    payload: Dict[str, Any],
    storage: ObjectStorage,
    embedding_provider: EmbeddingProvider
) -> None:
    doc_repo = DocumentRepository(db)
    chunk_repo = ChunkRepository(db)
    chunker = StructureAwareChunker()

    doc_id = uuid.UUID(payload["document_id"])
    doc = await doc_repo.get_by_id_unscoped(doc_id)
    if not doc:
        logger.error(f"Ingest failed: document {doc_id} not found")
        return

    # Update to PROCESSING
    await doc_repo.update_status(doc.id, DocumentStatus.PROCESSING.value)

    try:
        # 1. Fetch raw bytes from object storage
        data = await storage.download_bytes(doc.object_key)

        # 2. Verify SHA-256 checksum
        computed_hash = hashlib.sha256(data).hexdigest()
        if computed_hash != doc.checksum_sha256:
            raise DocMindException(
                status_code=400,
                code=DocumentErrorCode.CORRUPT_FILE.value,
                title="Checksum Mismatch",
                detail="Downloaded file checksum does not match upload intent declaration."
            )

        # 3. Verify magic bytes and safety
        verify_file_content(data, doc.filename)

        # 4. Parse according to extension
        ext = os.path.splitext(doc.filename.lower())[1]
        if ext == ".pdf":
            parsed = parse_pdf(data)
        elif ext == ".docx":
            parsed = parse_docx(data)
        elif ext == ".md":
            parsed = parse_markdown(data)
        elif ext == ".txt":
            parsed = parse_text(data)
        else:
            raise DocMindException(
                status_code=400,
                code=DocumentErrorCode.UNSUPPORTED_FORMAT.value,
                title="Unsupported Format",
                detail=f"Format '{ext}' is not supported."
            )

        # 5. Chunk document structurally
        chunks_data = chunker.chunk_document(parsed)
        if not chunks_data:
            raise DocMindException(
                status_code=422,
                code=DocumentErrorCode.NO_EXTRACTABLE_TEXT.value,
                title="No Chunks Extracted",
                detail="Document yielded no text chunks for vector indexing."
            )

        # 6. Generate 768-dim embeddings in batches of 16
        batch_size = 16
        for i in range(0, len(chunks_data), batch_size):
            batch = chunks_data[i:i + batch_size]
            texts = [c["content"] for c in batch]
            embeddings = await embedding_provider.embed_documents(texts)
            for j, emb in enumerate(embeddings):
                batch[j]["embedding"] = emb

        # 7. Upsert chunks transactionally into pgvector
        await chunk_repo.bulk_insert_chunks(
            workspace_id=doc.workspace_id,
            document_id=doc.id,
            chunks_data=chunks_data,
            processing_version=doc.processing_version
        )

        # 8. Mark document READY
        await doc_repo.update_status(
            document_id=doc.id,
            status=DocumentStatus.READY.value,
            page_count=parsed.page_count
        )
        logger.info(f"Document {doc.id} ({doc.filename}) successfully ingested ({len(chunks_data)} chunks).")

    except DocMindException as e:
        logger.warning(f"Document {doc.id} ingestion failed: {e.code} - {e.detail}")
        await doc_repo.update_status(
            document_id=doc.id,
            status=DocumentStatus.FAILED.value,
            error_code=e.code,
            error_message=e.detail
        )
        raise
    except Exception as e:
        logger.exception(f"Unexpected error ingesting document {doc.id}: {str(e)}")
        await doc_repo.update_status(
            document_id=doc.id,
            status=DocumentStatus.FAILED.value,
            error_code=DocumentErrorCode.UNKNOWN_PROCESSING_ERROR.value,
            error_message="An unexpected system error occurred during document processing."
        )
        raise
