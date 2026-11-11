from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.v1.dependencies import WorkspaceContext, require_write_access
from app.db.session import get_db
from app.repositories.workspace import WorkspaceRepository
from app.schemas.intelligence import CompareDocumentsRequest, CompareDocumentsResponse
from app.services.ai_intelligence import IntelligenceService

router = APIRouter(prefix="/documents", tags=["Document Intelligence"])


@router.post("/compare", response_model=CompareDocumentsResponse)
async def compare_documents(
    req: CompareDocumentsRequest,
    ctx: WorkspaceContext = Depends(require_write_access),
    db: AsyncSession = Depends(get_db)
):
    allowed_spaces = await WorkspaceRepository(db).get_accessible_space_ids(ctx.workspace.id, ctx.user.id, ctx.role)
    intel_service = IntelligenceService(db)
    return await intel_service.compare_documents(
        workspace_id=ctx.workspace.id,
        document_ids=req.document_ids,
        focus_topic=req.focus_topic,
        user_id=ctx.user.id,
        allowed_space_ids=allowed_spaces,
    )
