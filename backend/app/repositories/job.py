import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import Job
from app.models.enums import JobStatus, JobType


class JobRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def enqueue_job(
        self,
        workspace_id: uuid.UUID,
        job_type: str,
        payload: Dict[str, Any],
        idempotency_key: Optional[str] = None,
        priority: int = 0
    ) -> Job:
        if idempotency_key:
            existing = await self.db.execute(select(Job).where(Job.idempotency_key == idempotency_key))
            row = existing.scalar_one_or_none()
            if row:
                return row

        job = Job(
            workspace_id=workspace_id,
            job_type=job_type,
            payload=payload,
            idempotency_key=idempotency_key,
            priority=priority,
            status=JobStatus.QUEUED.value
        )
        self.db.add(job)
        await self.db.flush()
        return job

    async def get_by_id(self, job_id: uuid.UUID) -> Optional[Job]:
        result = await self.db.execute(select(Job).where(Job.id == job_id))
        return result.scalar_one_or_none()

    async def claim_next_job(self, worker_id: str) -> Optional[Job]:
        """
        Transactional claim query using PostgreSQL SELECT ... FOR UPDATE SKIP LOCKED.
        Safely coordinates single/multiple workers without a separate Redis broker.
        """
        now = datetime.now(timezone.utc)
        claim_stmt = (
            select(Job)
            .where(
                Job.status.in_([JobStatus.QUEUED.value, JobStatus.RETRY_WAIT.value]),
                Job.available_at <= now
            )
            .order_by(Job.priority.desc(), Job.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        result = await self.db.execute(claim_stmt)
        job = result.scalar_one_or_none()

        if job:
            job.status = JobStatus.RUNNING.value
            job.locked_at = now
            job.locked_by = worker_id
            job.heartbeat_at = now
            job.attempts += 1
            await self.db.flush()
            return job

        return None

    async def update_heartbeat(self, job_id: uuid.UUID) -> None:
        await self.db.execute(
            update(Job)
            .where(Job.id == job_id)
            .values(heartbeat_at=datetime.now(timezone.utc))
        )
        await self.db.flush()

    async def mark_succeeded(self, job_id: uuid.UUID) -> None:
        await self.db.execute(
            update(Job)
            .where(Job.id == job_id)
            .values(status=JobStatus.SUCCEEDED.value, updated_at=datetime.now(timezone.utc))
        )
        await self.db.flush()

    async def mark_failed(self, job_id: uuid.UUID, error: str, retryable: bool = False) -> None:
        job = await self.get_by_id(job_id)
        if not job:
            return

        now = datetime.now(timezone.utc)
        if retryable and job.attempts < job.max_attempts:
            delay_seconds = 10 * (2 ** (job.attempts - 1))  # Exponential backoff: 10s, 20s, 40s
            job.status = JobStatus.RETRY_WAIT.value
            job.available_at = now + timedelta(seconds=delay_seconds)
            job.last_error = error
        else:
            job.status = JobStatus.FAILED.value
            job.last_error = error

        job.updated_at = now
        await self.db.flush()

    async def reset_stale_jobs(self, lease_seconds: int = 60) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=lease_seconds)
        stmt = (
            update(Job)
            .where(
                Job.status == JobStatus.RUNNING.value,
                Job.heartbeat_at < cutoff
            )
            .values(
                status=JobStatus.RETRY_WAIT.value,
                locked_by=None,
                locked_at=None,
                updated_at=datetime.now(timezone.utc)
            )
        )
        result = await self.db.execute(stmt)
        await self.db.flush()
        return int(getattr(result, "rowcount", 0))
