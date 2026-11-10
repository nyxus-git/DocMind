from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.db.session import get_db
from app.models.entities import Job
from app.models.enums import JobStatus

router = APIRouter(prefix="/health", tags=["Health & Diagnostics"])


@router.get("/live", status_code=status.HTTP_200_OK)
async def health_live():
    """Liveness probe: verifies process event loop is responsive."""
    return {"status": "ok", "service": "docmind-api"}


@router.get("/ready")
async def health_ready(db: AsyncSession = Depends(get_db)):
    """Readiness probe: validates database connection and queue telemetry."""
    try:
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unhealthy", "database": str(e)}
        )

    queued_jobs = 0
    failed_jobs = 0
    try:
        queued_jobs = await db.scalar(
            select(func.count(Job.id)).where(Job.status.in_([JobStatus.QUEUED.value, JobStatus.RUNNING.value, JobStatus.RETRY_WAIT.value]))
        ) or 0
        failed_jobs = await db.scalar(
            select(func.count(Job.id)).where(Job.status == JobStatus.FAILED.value)
        ) or 0
    except Exception:
        pass

    storage_mode = "r2" if (settings.R2_ACCOUNT_ID and settings.R2_ACCESS_KEY_ID) else "local"

    return {
        "status": "ready",
        "service": "docmind-api",
        "database": db_status,
        "storage_mode": storage_mode,
        "queued_jobs": queued_jobs,
        "failed_jobs": failed_jobs,
        "ai_features_enabled": settings.AI_FEATURES_ENABLED,
        "embedding_model": settings.EMBEDDING_MODEL,
        "llm_model": settings.LLM_MODEL
    }
