import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional, Set, Tuple
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import Document
from app.models.enums import DocumentStatus

_UNSET_SPACE = object()


class DocumentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _apply_space_scope(
        query: Any,
        allowed_space_ids: Optional[Set[uuid.UUID]] = None,
        space_id: Optional[uuid.UUID] = None,
    ) -> Any:
        if allowed_space_ids is not None:
            if allowed_space_ids:
                query = query.where(or_(Document.space_id.is_(None), Document.space_id.in_(allowed_space_ids)))
            else:
                query = query.where(Document.space_id.is_(None))
        if space_id is not None:
            query = query.where(Document.space_id == space_id)
        return query

    async def create_upload_intent(
        self,
        workspace_id: uuid.UUID,
        uploaded_by: uuid.UUID,
        filename: str,
        mime_type: str,
        size_bytes: int,
        checksum_sha256: str,
        object_key: str,
        space_id: Optional[uuid.UUID] = None,
    ) -> Document:
        doc = Document(
            workspace_id=workspace_id,
            space_id=space_id,
            uploaded_by=uploaded_by,
            filename=filename,
            mime_type=mime_type,
            size_bytes=size_bytes,
            checksum_sha256=checksum_sha256,
            object_key=object_key,
            status=DocumentStatus.UPLOADING.value
        )
        self.db.add(doc)
        await self.db.flush()
        return doc

    async def get_by_id(
        self,
        workspace_id: uuid.UUID,
        document_id: uuid.UUID,
        allowed_space_ids: Optional[Set[uuid.UUID]] = None,
    ) -> Optional[Document]:
        """Strict tenant-scoped (and optional space-scoped) document lookup."""
        query = select(Document).where(
            Document.id == document_id,
            Document.workspace_id == workspace_id,
            Document.status != DocumentStatus.DELETED.value
        )
        query = self._apply_space_scope(query, allowed_space_ids=allowed_space_ids)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_id_unscoped(self, document_id: uuid.UUID) -> Optional[Document]:
        """Worker-only lookup for trusted background tasks."""
        result = await self.db.execute(select(Document).where(Document.id == document_id))
        return result.scalar_one_or_none()

    async def list_documents(
        self,
        workspace_id: uuid.UUID,
        status: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 50,
        cursor: Optional[datetime] = None,
        allowed_space_ids: Optional[Set[uuid.UUID]] = None,
        space_id: Optional[uuid.UUID] = None,
    ) -> List[Document]:
        if space_id is not None and allowed_space_ids is not None and space_id not in allowed_space_ids:
            return []

        query = select(Document).where(
            Document.workspace_id == workspace_id,
            Document.status != DocumentStatus.DELETED.value
        )
        query = self._apply_space_scope(query, allowed_space_ids=allowed_space_ids, space_id=space_id)

        if status:
            query = query.where(Document.status == status)
        if search:
            query = query.where(Document.filename.ilike(f"%{search}%"))
        if cursor:
            query = query.where(Document.created_at < cursor)

        query = query.order_by(Document.created_at.desc()).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_status(
        self,
        document_id: uuid.UUID,
        status: str,
        page_count: Optional[int] = None,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None
    ) -> None:
        values = {
            "status": status,
            "updated_at": datetime.now(timezone.utc)
        }
        if page_count is not None:
            values["page_count"] = page_count
        if status in [DocumentStatus.READY.value, DocumentStatus.QUEUED.value]:
            if status == DocumentStatus.READY.value:
                values["ready_at"] = datetime.now(timezone.utc)
            values["error_code"] = None
            values["error_message"] = None
        if error_code is not None:
            values["error_code"] = error_code
            values["error_message"] = error_message

        await self.db.execute(update(Document).where(Document.id == document_id).values(**values))
        await self.db.flush()

    async def update_metadata(
        self,
        workspace_id: uuid.UUID,
        document_id: uuid.UUID,
        filename: Optional[str] = None,
        tags: Optional[List[str]] = None,
        space_id: Any = _UNSET_SPACE,
    ) -> Optional[Document]:
        doc = await self.get_by_id(workspace_id, document_id)
        if not doc:
            return None
        if filename:
            doc.filename = filename
        if tags is not None:
            doc.tags = tags
        if space_id is not _UNSET_SPACE:
            doc.space_id = space_id
        doc.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return doc

    async def mark_deleting(self, workspace_id: uuid.UUID, document_id: uuid.UUID) -> Optional[Document]:
        doc = await self.get_by_id(workspace_id, document_id)
        if doc:
            doc.status = DocumentStatus.DELETING.value
            doc.updated_at = datetime.now(timezone.utc)
            await self.db.flush()
        return doc

    async def get_ready_documents(
        self,
        workspace_id: uuid.UUID,
        doc_ids: Optional[List[uuid.UUID]] = None,
        allowed_space_ids: Optional[Set[uuid.UUID]] = None,
        space_id: Optional[uuid.UUID] = None,
    ) -> List[Document]:
        if space_id is not None and allowed_space_ids is not None and space_id not in allowed_space_ids:
            return []

        query = select(Document).where(
            Document.workspace_id == workspace_id,
            Document.status == DocumentStatus.READY.value
        )
        query = self._apply_space_scope(query, allowed_space_ids=allowed_space_ids, space_id=space_id)
        if doc_ids:
            query = query.where(Document.id.in_(doc_ids))
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count_workspace_usage(self, workspace_id: uuid.UUID) -> Tuple[int, int]:
        result = await self.db.execute(
            select(
                func.count(Document.id),
                func.coalesce(func.sum(Document.size_bytes), 0)
            ).where(
                Document.workspace_id == workspace_id,
                Document.status.in_([
                    DocumentStatus.UPLOADING.value,
                    DocumentStatus.QUEUED.value,
                    DocumentStatus.PROCESSING.value,
                    DocumentStatus.READY.value
                ])
            )
        )
        row = result.one()
        return int(row[0]), int(row[1])

    async def count_user_active_uploads(self, user_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(Document.id)).where(
                Document.uploaded_by == user_id,
                Document.status.in_([
                    DocumentStatus.UPLOADING.value,
                    DocumentStatus.QUEUED.value,
                    DocumentStatus.PROCESSING.value
                ])
            )
        )
        return int(result.scalar_one_or_none() or 0)
