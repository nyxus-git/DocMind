import uuid
from typing import Any, Dict, List, Optional, Set
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.adapters.storage.base import ObjectStorage
from app.adapters.storage.local import LocalStorage, get_storage
from app.adapters.storage.r2 import R2Storage
from app.core.exceptions import DocMindException, EntityNotFoundException
from app.core.http_safety import resolve_safe_inline_mime
from app.ingestion.validator import validate_file_metadata
from app.models.entities import Document, DocumentChunk
from app.models.enums import DocumentErrorCode, DocumentStatus, JobType
from app.repositories.audit import AuditRepository
from app.repositories.document import DocumentRepository, _UNSET_SPACE
from app.repositories.job import JobRepository
from app.repositories.usage import UsageRepository
from app.repositories.workspace import WorkspaceRepository
from app.schemas.document import (
    DocumentContentChunkDTO,
    DocumentContentResponse,
    DocumentDTO,
    SafeErrorDTO,
    UploadIntentResponse,
)
from app.services.quota import QuotaService


class DocumentService:
    def __init__(self, db: AsyncSession, storage: Optional[ObjectStorage] = None):
        self.db = db
        self.doc_repo = DocumentRepository(db)
        self.job_repo = JobRepository(db)
        self.usage_repo = UsageRepository(db)
        self.workspace_repo = WorkspaceRepository(db)
        self.audit_repo = AuditRepository(db)
        self.quota_service = QuotaService(self.doc_repo, self.usage_repo, self.workspace_repo)
        self.storage = storage or get_storage()

    async def create_upload_intent(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        filename: str,
        declared_mime: str,
        size_bytes: int,
        checksum_sha256: str,
        space_id: Optional[uuid.UUID] = None,
    ) -> UploadIntentResponse:
        # 1. Resolve workspace tier limits & validate file metadata
        limits = await self.quota_service.get_tier_limits(workspace_id)
        validate_file_metadata(filename, declared_mime, size_bytes, max_file_mb=limits.max_file_mb)

        # 2. Verify optional KnowledgeSpace belongs to same workspace
        if space_id is not None:
            space = await self.workspace_repo.get_space(workspace_id, space_id)
            if not space:
                raise EntityNotFoundException("KnowledgeSpace", space_id)

        # 3. Check dynamic workspace tier quotas & user concurrent uploads
        await self.quota_service.check_upload_quota(workspace_id, size_bytes, user_id=user_id)

        # 4. Generate opaque random UUID object key (never use user-supplied filename)
        object_key = f"raw/{workspace_id}/{uuid.uuid4()}.bin"

        # 5. Create document row in status UPLOADING
        doc = await self.doc_repo.create_upload_intent(
            workspace_id=workspace_id,
            uploaded_by=user_id,
            filename=filename,
            mime_type=declared_mime,
            size_bytes=size_bytes,
            checksum_sha256=checksum_sha256,
            object_key=object_key,
            space_id=space_id,
        )

        # 5. Issue short-lived presigned PUT URL
        upload_info = await self.storage.create_upload_url(
            object_key=object_key,
            content_type=declared_mime,
            size_bytes=size_bytes,
            expires_in=300
        )

        from datetime import datetime, timedelta, timezone
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=300)).isoformat()

        await self.audit_repo.record_event(
            workspace_id=workspace_id,
            actor_user_id=user_id,
            action="DOCUMENT_UPLOAD_INTENT_CREATED",
            target_type="document",
            target_id=doc.id,
            metadata={"filename": filename, "size_bytes": size_bytes}
        )

        return UploadIntentResponse(
            document_id=doc.id,
            upload_url=upload_info["upload_url"],
            method="PUT",
            headers=upload_info["headers"],
            expires_at=expires_at
        )

    async def complete_upload(
        self,
        workspace_id: uuid.UUID,
        document_id: uuid.UUID
    ) -> uuid.UUID:
        doc = await self.doc_repo.get_by_id(workspace_id, document_id)
        if not doc:
            raise EntityNotFoundException("Document", document_id)

        # Idempotency check: if already QUEUED, PROCESSING or READY, return existing state
        if doc.status in [DocumentStatus.QUEUED.value, DocumentStatus.PROCESSING.value, DocumentStatus.READY.value]:
            return doc.id

        if doc.status != DocumentStatus.UPLOADING.value:
            raise DocMindException(
                status_code=400,
                code="INVALID_DOCUMENT_STATE",
                title="Invalid State",
                detail=f"Cannot complete upload for document in status {doc.status}."
            )

        # Verify object exists in storage via HEAD and matches declared size limits
        head = await self.storage.head_object(doc.object_key)
        if not head:
            raise DocMindException(
                status_code=400,
                code=DocumentErrorCode.STORAGE_UNAVAILABLE.value,
                title="Object Not Found",
                detail="Uploaded object bytes were not found in storage. Ensure direct PUT completed successfully."
            )
        uploaded_size = head.get("size_bytes")
        if uploaded_size is not None and (uploaded_size <= 0 or uploaded_size != doc.size_bytes):
            raise DocMindException(
                status_code=400,
                code=DocumentErrorCode.CORRUPT_FILE.value,
                title="Uploaded Size Mismatch",
                detail="Uploaded object size does not match declared upload intent size."
            )

        # Transactionally transition to QUEUED and enqueue ingestion job
        await self.doc_repo.update_status(doc.id, DocumentStatus.QUEUED.value)
        job = await self.job_repo.enqueue_job(
            workspace_id=workspace_id,
            job_type=JobType.INGEST_DOCUMENT.value,
            payload={"document_id": str(doc.id), "processing_version": doc.processing_version},
            idempotency_key=f"ingest-{doc.id}-v{doc.processing_version}"
        )

        return job.id

    async def _space_name_map(self, workspace_id: uuid.UUID) -> Dict[uuid.UUID, str]:
        spaces = await self.workspace_repo.list_spaces(workspace_id)
        return {sp.id: sp.name for sp, _ in spaces}

    async def list_documents(
        self,
        workspace_id: uuid.UUID,
        status: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 50,
        allowed_space_ids: Optional[Set[uuid.UUID]] = None,
        space_id: Optional[uuid.UUID] = None,
    ) -> List[DocumentDTO]:
        docs = await self.doc_repo.list_documents(
            workspace_id,
            status=status,
            search=search,
            limit=limit,
            allowed_space_ids=allowed_space_ids,
            space_id=space_id,
        )
        space_names = await self._space_name_map(workspace_id) if any(d.space_id for d in docs) else {}
        return [self._to_dto(d, space_names=space_names) for d in docs]

    async def get_document(
        self,
        workspace_id: uuid.UUID,
        document_id: uuid.UUID,
        allowed_space_ids: Optional[Set[uuid.UUID]] = None,
    ) -> DocumentDTO:
        doc = await self.doc_repo.get_by_id(workspace_id, document_id, allowed_space_ids=allowed_space_ids)
        if not doc:
            raise EntityNotFoundException("Document", document_id)
        space_names = await self._space_name_map(workspace_id) if doc.space_id else {}
        return self._to_dto(doc, space_names=space_names)

    async def update_document(
        self,
        workspace_id: uuid.UUID,
        document_id: uuid.UUID,
        filename: Optional[str] = None,
        tags: Optional[List[str]] = None,
        space_id: Optional[uuid.UUID] = None,
        clear_space: bool = False,
    ) -> DocumentDTO:
        target_space: Any = _UNSET_SPACE
        if clear_space:
            target_space = None
        elif space_id is not None:
            space = await self.workspace_repo.get_space(workspace_id, space_id)
            if not space:
                raise EntityNotFoundException("KnowledgeSpace", space_id)
            target_space = space_id

        doc = await self.doc_repo.update_metadata(
            workspace_id,
            document_id,
            filename=filename,
            tags=tags,
            space_id=target_space,
        )
        if not doc:
            raise EntityNotFoundException("Document", document_id)
        space_names = await self._space_name_map(workspace_id) if doc.space_id else {}
        return self._to_dto(doc, space_names=space_names)

    async def delete_document(self, workspace_id: uuid.UUID, document_id: uuid.UUID) -> None:
        doc = await self.doc_repo.mark_deleting(workspace_id, document_id)
        if not doc:
            raise EntityNotFoundException("Document", document_id)

        # Enqueue background cleanup
        await self.job_repo.enqueue_job(
            workspace_id=workspace_id,
            job_type=JobType.DELETE_DOCUMENT.value,
            payload={"document_id": str(doc.id)},
            idempotency_key=f"delete-{doc.id}"
        )

        await self.audit_repo.record_event(
            workspace_id=workspace_id,
            action="DOCUMENT_DELETED",
            target_type="document",
            target_id=doc.id,
            metadata={"filename": doc.filename}
        )

    async def get_download_url(
        self,
        workspace_id: uuid.UUID,
        document_id: uuid.UUID,
        allowed_space_ids: Optional[Set[uuid.UUID]] = None,
    ) -> str:
        doc = await self.doc_repo.get_by_id(workspace_id, document_id, allowed_space_ids=allowed_space_ids)
        if not doc:
            raise EntityNotFoundException("Document", document_id)

        safe_mime = resolve_safe_inline_mime(doc.filename, doc.mime_type)
        head = await self.storage.head_object(doc.object_key)

        # Self-heal if running with R2 and binary still resides in LocalStorage from earlier upload
        if not head and isinstance(self.storage, R2Storage):
            local_fallback = LocalStorage()
            if await local_fallback.head_object(doc.object_key):
                raw_bytes = await local_fallback.download_bytes(doc.object_key)
                await self.storage.upload_bytes(doc.object_key, raw_bytes, content_type=safe_mime)
                head = {"size_bytes": len(raw_bytes)}

        if not head:
            raise DocMindException(
                status_code=404,
                code="STORAGE_OBJECT_MISSING",
                title="Original File Unavailable",
                detail=f"The original binary for '{doc.filename}' is not stored in cloud storage. Use the extracted text reader or re-upload the document.",
            )

        return await self.storage.create_download_url(
            doc.object_key,
            expires_in=120,
            content_type=safe_mime,
            filename=doc.filename,
        )

    async def get_document_content(
        self,
        workspace_id: uuid.UUID,
        document_id: uuid.UUID,
        allowed_space_ids: Optional[Set[uuid.UUID]] = None,
    ) -> DocumentContentResponse:
        doc = await self.doc_repo.get_by_id(workspace_id, document_id, allowed_space_ids=allowed_space_ids)
        if not doc:
            raise EntityNotFoundException("Document", document_id)

        rows = (
            await self.db.execute(
                select(DocumentChunk)
                .where(
                    DocumentChunk.workspace_id == workspace_id,
                    DocumentChunk.document_id == doc.id,
                )
                .order_by(DocumentChunk.chunk_index.asc())
                .limit(200)
            )
        ).scalars().all()

        storage_available = bool(await self.storage.head_object(doc.object_key))
        return DocumentContentResponse(
            document_id=doc.id,
            filename=doc.filename,
            mime_type=doc.mime_type,
            page_count=doc.page_count,
            storage_available=storage_available,
            chunks=[
                DocumentContentChunkDTO(
                    chunk_index=c.chunk_index,
                    page_start=c.page_start,
                    page_end=c.page_end,
                    section_path=c.section_path,
                    content=c.content,
                )
                for c in rows
            ],
        )

    async def retry_processing(self, workspace_id: uuid.UUID, document_id: uuid.UUID) -> uuid.UUID:
        doc = await self.doc_repo.get_by_id(workspace_id, document_id)
        if not doc:
            raise EntityNotFoundException("Document", document_id)

        if doc.status != DocumentStatus.FAILED.value:
            raise DocMindException(
                status_code=400,
                code="INVALID_RETRY_STATE",
                title="Cannot Retry",
                detail="Only documents in FAILED status can be retried."
            )

        doc.processing_version += 1
        await self.doc_repo.update_status(doc.id, DocumentStatus.QUEUED.value)
        job = await self.job_repo.enqueue_job(
            workspace_id=workspace_id,
            job_type=JobType.INGEST_DOCUMENT.value,
            payload={"document_id": str(doc.id), "processing_version": doc.processing_version},
            idempotency_key=f"ingest-{doc.id}-v{doc.processing_version}"
        )
        return job.id

    def _to_dto(
        self,
        doc: Document,
        space_names: Optional[Dict[uuid.UUID, str]] = None,
    ) -> DocumentDTO:
        safe_error = None
        if doc.error_code:
            safe_error = SafeErrorDTO(
                code=doc.error_code,
                message=doc.error_message or "Processing error occurred.",
                retryable=(doc.status == DocumentStatus.FAILED.value)
            )

        return DocumentDTO(
            id=doc.id,
            workspace_id=doc.workspace_id,
            space_id=doc.space_id,
            space_name=(space_names or {}).get(doc.space_id) if doc.space_id else None,
            filename=doc.filename,
            mime_type=doc.mime_type,
            size_bytes=doc.size_bytes,
            checksum_short=doc.checksum_sha256[:8],
            status=doc.status,
            page_count=doc.page_count,
            processing_version=doc.processing_version,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            ready_at=doc.ready_at,
            tags=doc.tags or [],
            safe_error=safe_error
        )
