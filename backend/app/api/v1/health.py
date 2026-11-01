from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.db.session import get_db

router = APIRouter(prefix="/health", tags=["Health & Diagnostics"])


@router.get("/live", status_code=status.HTTP_200_OK)
async def health_live():
    """Liveness probe: verifies process event loop is responsive."""
    return {"status": "ok", "service": "docmind-api"}


@router.get("/ready")
async def health_ready(db: AsyncSession = Depends(get_db)):
    """Readiness probe: validates database connection and critical configuration."""
    try:
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unhealthy", "database": str(e)}
        )

    return {
        "status": "ready",
        "service": "docmind-api",
        "database": db_status,
        "ai_features_enabled": settings.AI_FEATURES_ENABLED,
        "embedding_model": settings.EMBEDDING_MODEL,
        "llm_model": settings.LLM_MODEL
    }
