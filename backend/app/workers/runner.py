import asyncio
import logging
import signal
import sys
import uuid
from app.adapters.ai.gemini import get_embedding_provider
from app.adapters.storage.local import get_storage
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import AsyncSessionLocal
from app.models.enums import JobType
from app.repositories.job import JobRepository
from app.workers.handlers.delete import handle_delete_job
from app.workers.handlers.ingest import handle_ingest_job

logger = logging.getLogger("docmind.worker")

running = True


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
                    recovered = await job_repo.reset_stale_jobs(lease_seconds=60)
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

                logger.info(f"Claimed job {job.id} (type: {job.job_type}, attempt {job.attempts}/{job.max_attempts})")
                await session.commit()

                # Dispatch job
                async with AsyncSessionLocal() as exec_session:
                    try:
                        if job.job_type == JobType.INGEST_DOCUMENT.value:
                            await handle_ingest_job(exec_session, job.payload, storage, embedding_provider)
                        elif job.job_type == JobType.DELETE_DOCUMENT.value:
                            await handle_delete_job(exec_session, job.payload, storage)
                        
                        # Mark succeeded
                        job_repo_exec = JobRepository(exec_session)
                        await job_repo_exec.mark_succeeded(job.id)
                        await exec_session.commit()
                        logger.info(f"Job {job.id} completed successfully.")
                    except Exception as e:
                        logger.error(f"Job {job.id} failed with error: {str(e)}")
                        await exec_session.rollback()
                        
                        async with AsyncSessionLocal() as fail_session:
                            fail_repo = JobRepository(fail_session)
                            await fail_repo.mark_failed(job.id, error=str(e), retryable=True)
                            await fail_session.commit()

            except Exception as e:
                logger.error(f"Worker polling loop error: {e}")
                await asyncio.sleep(3.0)

    logger.info("Worker process terminated cleanly.")


if __name__ == "__main__":
    asyncio.run(run_worker())
