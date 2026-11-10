from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.adapters.storage.local import is_r2_configured
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
    """Readiness probe: validates database connection and queue telemetry in a single SQL round-trip."""
    try:
        row = (
            await db.execute(
                select(
                    func.coalesce(
                        func.sum(
                            case(
                                (Job.status.in_([JobStatus.QUEUED.value, JobStatus.RUNNING.value, JobStatus.RETRY_WAIT.value]), 1),
                                else_=0,
                            )
                        ),
                        0,
                    ),
                    func.coalesce(
                        func.sum(case((Job.status == JobStatus.FAILED.value, 1), else_=0)),
                        0,
                    ),
                )
            )
        ).one()
        db_status = "connected"
        queued_jobs = int(row[0] or 0)
        failed_jobs = int(row[1] or 0)
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unhealthy", "database": str(e)}
        )

    storage_mode = "r2" if is_r2_configured() else "local"

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
