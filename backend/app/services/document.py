import uuid
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.adapters.storage.base import ObjectStorage
from app.adapters.storage.local import get_storage
from app.core.exceptions import DocMindException, EntityNotFoundException
from app.ingestion.validator import validate_file_metadata
from app.models.entities import Document
from app.models.enums import DocumentErrorCode, DocumentStatus, JobType
from app.repositories.document import DocumentRepository
from app.repositories.job import JobRepository
from app.repositories.usage import UsageRepository
from app.schemas.document import DocumentDTO, SafeErrorDTO, UploadIntentResponse
from app.services.quota import QuotaService


class DocumentService:
    def __init__(self, db: AsyncSession, storage: Optional[ObjectStorage] = None):
        self.db = db
        self.doc_repo = DocumentRepository(db)
        self.job_repo = JobRepository(db)
        self.usage_repo = UsageRepository(db)
        self.quota_service = QuotaService(self.doc_repo, self.usage_repo)
        self.storage = storage or get_storage()

    async def create_upload_intent(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        filename: str,
        declared_mime: str,
        size_bytes: int,
        checksum_sha256: str
    ) -> UploadIntentResponse:
        # 1. Validate file metadata (whitelist, max 20 MB)
        validate_file_metadata(filename, declared_mime, size_bytes)

        # 2. Check workspace quotas
        await self.quota_service.check_upload_quota(workspace_id, size_bytes)

        # 3. Generate opaque random UUID object key (never use user-supplied filename)
        object_key = f"raw/{workspace_id}/{uuid.uuid4()}.bin"

        # 4. Create document row in status UPLOADING
        doc = await self.doc_repo.create_upload_intent(
            workspace_id=workspace_id,
            uploaded_by=user_id,
            filename=filename,
            mime_type=declared_mime,
            size_bytes=size_bytes,
            checksum_sha256=checksum_sha256,
            object_key=object_key
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

        # Verify object exists in storage via HEAD
        head = await self.storage.head_object(doc.object_key)
        if not head:
            raise DocMindException(
                status_code=400,
                code=DocumentErrorCode.STORAGE_UNAVAILABLE.value,
                title="Object Not Found",
                detail="Uploaded object bytes were not found in storage. Ensure direct PUT completed successfully."
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

    async def list_documents(
        self,
        workspace_id: uuid.UUID,
        status: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 50
    ) -> List[DocumentDTO]:
        docs = await self.doc_repo.list_documents(workspace_id, status=status, search=search, limit=limit)
        return [self._to_dto(d) for d in docs]

    async def get_document(self, workspace_id: uuid.UUID, document_id: uuid.UUID) -> DocumentDTO:
        doc = await self.doc_repo.get_by_id(workspace_id, document_id)
        if not doc:
            raise EntityNotFoundException("Document", document_id)
        return self._to_dto(doc)

    async def update_document(
        self,
        workspace_id: uuid.UUID,
        document_id: uuid.UUID,
        filename: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> DocumentDTO:
        doc = await self.doc_repo.update_metadata(workspace_id, document_id, filename=filename, tags=tags)
        if not doc:
            raise EntityNotFoundException("Document", document_id)
        return self._to_dto(doc)

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

    async def get_download_url(self, workspace_id: uuid.UUID, document_id: uuid.UUID) -> str:
        doc = await self.doc_repo.get_by_id(workspace_id, document_id)
        if not doc:
            raise EntityNotFoundException("Document", document_id)

        return await self.storage.create_download_url(doc.object_key, expires_in=120)

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

    def _to_dto(self, doc: Document) -> DocumentDTO:
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
