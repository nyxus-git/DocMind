import asyncio
import logging
import os
from sqlalchemy import select
from app.adapters.storage.local import LocalStorage
from app.adapters.storage.r2 import R2Storage
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.entities import Document
from app.models.enums import DocumentStatus

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("docmind.r2_migration")


async def migrate_local_files_to_r2() -> None:
    if not (settings.R2_ACCOUNT_ID.strip() and settings.R2_ACCESS_KEY_ID.strip() and settings.R2_SECRET_ACCESS_KEY.strip()):
        logger.error("R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are not configured in .env.")
        return

    local_storage = LocalStorage()
    r2_storage = R2Storage()

    migrated = 0
    already_in_r2 = 0
    missing_local = 0

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(Document).where(Document.status != DocumentStatus.DELETED.value)
            )
        ).scalars().all()

        logger.info("Checking %d active document(s) against R2 bucket '%s'...", len(rows), r2_storage.bucket)
        for doc in rows:
            existing = await r2_storage.head_object(doc.object_key)
            if existing:
                already_in_r2 += 1
                continue

            local_path = local_storage._resolve_path(doc.object_key)
            if not os.path.exists(local_path):
                logger.warning("Local file missing for '%s' (%s) at %s", doc.filename, doc.object_key, local_path)
                missing_local += 1
                continue

            data = await local_storage.download_bytes(doc.object_key)
            await r2_storage.upload_bytes(doc.object_key, data, content_type=doc.mime_type or "application/octet-stream")
            logger.info("Uploaded '%s' (%d bytes) -> r2://%s/%s", doc.filename, len(data), r2_storage.bucket, doc.object_key)
            migrated += 1

    logger.info(
        "Migration finished: %d uploaded to R2, %d already on R2, %d missing locally.",
        migrated,
        already_in_r2,
        missing_local,
    )


if __name__ == "__main__":
    asyncio.run(migrate_local_files_to_r2())

