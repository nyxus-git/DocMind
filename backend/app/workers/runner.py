import asyncio
import logging
import signal
import sys
import uuid
from typing import Any, Dict, Tuple
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from app.adapters.ai.gemini import get_embedding_provider
from app.adapters.storage.local import get_storage
from app.core.config import settings
from app.core.exceptions import DocMindException, ServiceDegradedException
from app.core.logging import setup_logging
from app.db.session import AsyncSessionLocal
from app.models.enums import DocumentErrorCode, DocumentStatus, JobStatus, JobType
from app.repositories.document import DocumentRepository
from app.repositories.job import JobRepository
from app.workers.handlers.delete import handle_delete_job
from app.workers.handlers.delete_account import handle_delete_account_job
from app.workers.handlers.ingest import handle_ingest_job

logger = logging.getLogger("docmind.worker")

running = True


def _extract_failure_details(exc: Exception) -> Tuple[bool, str, str]:
    """Returns (retryable, error_code, safe_error_message) for a failed job exception."""
    if isinstance(exc, DocMindException):
        retryable = isinstance(exc, ServiceDegradedException)
        return retryable, exc.code, exc.detail
    return True, DocumentErrorCode.UNKNOWN_PROCESSING_ERROR.value, "An unexpected system error occurred during document processing."


async def _finalize_failed_job(
    job_id: uuid.UUID,
    job_type: str,
    payload: Dict[str, Any],
    exc: Exception,
    session_factory: async_sessionmaker[AsyncSession] = AsyncSessionLocal,
) -> None:
    """Persists retry/failure state on Job and keeps linked Document status accurate after rollback."""
    retryable, err_code, err_msg = _extract_failure_details(exc)
    async with session_factory() as fail_session:
        fail_repo = JobRepository(fail_session)
        updated_job = await fail_repo.mark_failed(job_id, error=str(exc), retryable=retryable)

        if job_type == JobType.INGEST_DOCUMENT.value and "document_id" in payload:
            doc_id = uuid.UUID(str(payload["document_id"]))
            doc_repo = DocumentRepository(fail_session)
            if updated_job and updated_job.status == JobStatus.FAILED.value:
                await doc_repo.update_status(
                    doc_id,
                    DocumentStatus.FAILED.value,
                    error_code=err_code,
                    error_message=err_msg,
                )
            else:
                await doc_repo.update_status(doc_id, DocumentStatus.QUEUED.value)

        await fail_session.commit()


def handle_stop_signals(sig, frame):
    global running
    logger.info("Worker received termination signal. Shutting down gracefully...")
    running = False


async def run_worker():
    global running
    setup_logging()
    worker_id = f"worker-{uuid.uuid4().hex[:8]}"
    logger.info(f"Starting DocMind background worker ({worker_id}) with concurrency={settings.WORKER_CONCURRENCY}...")

    storage = get_storage()
    embedding_provider = get_embedding_provider()

    signal.signal(signal.SIGINT, handle_stop_signals)
    signal.signal(signal.SIGTERM, handle_stop_signals)

    loop_count = 0
    while running:
        loop_count += 1
        async with AsyncSessionLocal() as session:
            job_repo = JobRepository(session)

            # Periodically reset stale crashed jobs every 30 iterations (~60s)
            if loop_count % 30 == 0:
                try:
                    recovered = await job_repo.reset_stale_jobs(lease_seconds=300)
                    if recovered > 0:
                        logger.info(f"Recovered {recovered} stale jobs back to queue.")
                    await session.commit()
                except Exception as e:
                    logger.warning(f"Error resetting stale jobs: {e}")
                    await session.rollback()

            # Claim next job
            try:
                job = await job_repo.claim_next_job(worker_id)
                if not job:
                    await session.commit()
                    await asyncio.sleep(2.0)
                    continue

                if job.job_type == JobType.INGEST_DOCUMENT.value and "document_id" in job.payload:
                    await DocumentRepository(session).update_status(
                        uuid.UUID(str(job.payload["document_id"])),
                        DocumentStatus.PROCESSING.value,
                    )

                logger.info(f"Claimed job {job.id} (type: {job.job_type}, attempt {job.attempts}/{job.max_attempts})")
                await session.commit()

                # Dispatch job
                async with AsyncSessionLocal() as exec_session:
                    try:
                        if job.job_type == JobType.INGEST_DOCUMENT.value:
                            await handle_ingest_job(exec_session, job.payload, storage, embedding_provider)
                        elif job.job_type == JobType.DELETE_DOCUMENT.value:
                            await handle_delete_job(exec_session, job.payload, storage)
                        elif job.job_type == JobType.DELETE_ACCOUNT.value:
                            await handle_delete_account_job(exec_session, job.payload, storage)

                        # Mark succeeded
                        job_repo_exec = JobRepository(exec_session)
                        await job_repo_exec.mark_succeeded(job.id)
                        await exec_session.commit()
                        logger.info(f"Job {job.id} completed successfully.")
                    except Exception as e:
                        logger.error(f"Job {job.id} failed with error: {str(e)}")
                        await exec_session.rollback()
                        await _finalize_failed_job(job.id, job.job_type, job.payload, e)

            except Exception as e:
                logger.error(f"Worker polling loop error: {e}")
                await asyncio.sleep(3.0)

    logger.info("Worker process terminated cleanly.")


if __name__ == "__main__":
    asyncio.run(run_worker())
