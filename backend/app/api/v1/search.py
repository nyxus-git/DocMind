from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.v1.dependencies import WorkspaceContext, get_current_workspace
from app.db.session import get_db
from app.schemas.chat import ContentSearchRequest, SearchResponse
from app.services.ai_chat import ChatService

router = APIRouter(tags=["Search"])


@router.post("/search", response_model=SearchResponse)
async def search_content(
    req: ContentSearchRequest,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    chat_service = ChatService(db)
    results = await chat_service.search_content(
        workspace_id=ctx.workspace.id,
        query=req.query,
        document_ids=req.document_ids,
        limit=req.limit
    )
    return SearchResponse(
        query=req.query,
        results=results,
        total_found=len(results)
    )
