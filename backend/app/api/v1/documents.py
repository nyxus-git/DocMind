import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.adapters.storage.local import LocalStorage, get_storage
from app.api.v1.dependencies import WorkspaceContext, get_current_workspace, require_verified_user
from app.db.session import get_db
from app.schemas.common import MessageResponse
from app.schemas.document import (
    DocumentDTO,
    DocumentUpdateDTO,
    SignedDownloadResponse,
    UploadCompleteResponse,
    UploadIntentRequest,
    UploadIntentResponse,
)
from app.schemas.intelligence import DocumentSummaryResponse
from app.services.ai_intelligence import IntelligenceService
from app.services.document import DocumentService

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post("/upload-intents", response_model=UploadIntentResponse, status_code=status.HTTP_201_CREATED)
async def create_upload_intent(
    req: UploadIntentRequest,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    doc_service = DocumentService(db)
    return await doc_service.create_upload_intent(
        workspace_id=ctx.workspace.id,
        user_id=ctx.user.id,
        filename=req.filename,
        declared_mime=req.declared_mime,
        size_bytes=req.size_bytes,
        checksum_sha256=req.checksum_sha256
    )


@router.post("/{document_id}/complete", response_model=UploadCompleteResponse, status_code=status.HTTP_202_ACCEPTED)
async def complete_upload(
    document_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    doc_service = DocumentService(db)
    job_id = await doc_service.complete_upload(ctx.workspace.id, document_id)
    return UploadCompleteResponse(
        document_id=document_id,
        status="QUEUED",
        job_id=job_id
    )


@router.get("", response_model=List[DocumentDTO])
async def list_documents(
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    doc_service = DocumentService(db)
    return await doc_service.list_documents(
        workspace_id=ctx.workspace.id,
        status=status,
        search=q,
        limit=limit
    )


@router.get("/{document_id}", response_model=DocumentDTO)
async def get_document(
    document_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    doc_service = DocumentService(db)
    return await doc_service.get_document(ctx.workspace.id, document_id)


@router.patch("/{document_id}", response_model=DocumentDTO)
async def update_document(
    document_id: uuid.UUID,
    req: DocumentUpdateDTO,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    doc_service = DocumentService(db)
    return await doc_service.update_document(
        workspace_id=ctx.workspace.id,
        document_id=document_id,
        filename=req.filename,
        tags=req.tags
    )


@router.post("/{document_id}/retry", response_model=UploadCompleteResponse)
async def retry_document_processing(
    document_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    doc_service = DocumentService(db)
    job_id = await doc_service.retry_processing(ctx.workspace.id, document_id)
    return UploadCompleteResponse(
        document_id=document_id,
        status="QUEUED",
        job_id=job_id
    )


@router.post("/{document_id}/download-url", response_model=SignedDownloadResponse)
async def get_document_download_url(
    document_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    doc_service = DocumentService(db)
    url = await doc_service.get_download_url(ctx.workspace.id, document_id)
    from datetime import datetime, timedelta, timezone
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=120)).isoformat()
    return SignedDownloadResponse(download_url=url, expires_at=expires_at)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    doc_service = DocumentService(db)
    await doc_service.delete_document(ctx.workspace.id, document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{document_id}/summary", response_model=DocumentSummaryResponse)
async def get_document_summary(
    document_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    intel_service = IntelligenceService(db)
    return await intel_service.get_or_generate_summary(ctx.workspace.id, document_id)


# Local mock storage upload/download handler for development & integration tests
mock_storage_router = APIRouter(prefix="/mock-storage", tags=["Mock Storage"])


@mock_storage_router.put("/upload")
async def mock_upload(request: Request, key: str = Query(...)):
    storage = get_storage()
    if isinstance(storage, LocalStorage):
        body = await request.body()
        await storage.save_bytes(key, body)
        return {"status": "uploaded", "size": len(body)}
    return {"status": "ok"}


@mock_storage_router.get("/download")
async def mock_download(key: str = Query(...)):
    storage = get_storage()
    if isinstance(storage, LocalStorage):
        data = await storage.download_bytes(key)
        return Response(content=data, media_type="application/octet-stream")
    return Response(content=b"", media_type="application/octet-stream")
