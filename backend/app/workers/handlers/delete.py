import logging
import uuid
from typing import Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from app.adapters.storage.base import ObjectStorage
from app.models.enums import DocumentStatus
from app.repositories.chunk import ChunkRepository
from app.repositories.document import DocumentRepository

logger = logging.getLogger("docmind.worker.delete")


async def handle_delete_job(
    db: AsyncSession,
    payload: Dict[str, Any],
    storage: ObjectStorage
) -> None:
    doc_repo = DocumentRepository(db)
    chunk_repo = ChunkRepository(db)

    doc_id = uuid.UUID(payload["document_id"])
    doc = await doc_repo.get_by_id_unscoped(doc_id)
    if not doc:
        return

    # 1. Delete chunks from database
    await chunk_repo.delete_by_document(doc.id)

    # 2. Delete raw object from R2 storage
    try:
        await storage.delete_object(doc.object_key)
    except Exception as e:
        logger.warning(f"Failed to delete storage object {doc.object_key}: {e}")

    # 3. Mark document status DELETED
    await doc_repo.update_status(doc.id, DocumentStatus.DELETED.value)
    logger.info(f"Document {doc.id} completely deleted and purged.")
