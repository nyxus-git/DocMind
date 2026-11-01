from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.v1.dependencies import WorkspaceContext, get_current_workspace
from app.db.session import get_db
from app.schemas.intelligence import CompareDocumentsRequest, CompareDocumentsResponse
from app.services.ai_intelligence import IntelligenceService

router = APIRouter(prefix="/documents", tags=["Document Intelligence"])


@router.post("/compare", response_model=CompareDocumentsResponse)
async def compare_documents(
    req: CompareDocumentsRequest,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    intel_service = IntelligenceService(db)
    return await intel_service.compare_documents(
        workspace_id=ctx.workspace.id,
        document_ids=req.document_ids,
        focus_topic=req.focus_topic
    )
