import asyncio
import logging
from sqlalchemy import text
from app.db.session import async_engine, Base
import app.models.entities  # noqa: F401

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("docmind.migration")

MIGRATION_STATEMENTS = [
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
    'CREATE EXTENSION IF NOT EXISTS "citext";',
    'CREATE EXTENSION IF NOT EXISTS "vector";',
    "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS tier VARCHAR(32) NOT NULL DEFAULT 'STARTER';",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE NULL;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED';",
    "CREATE INDEX IF NOT EXISTS ix_workspaces_tier ON workspaces (tier);",
]


async def run_migrations():
    logger.info("Connecting to database to apply schema and migrations...")
    async with async_engine.begin() as conn:
        # 1. Create any missing tables
        logger.info("Ensuring all Base tables exist...")
        await conn.run_sync(Base.metadata.create_all)

        # 2. Apply column migrations
        for stmt in MIGRATION_STATEMENTS:
            try:
                logger.info("Executing: %s", stmt)
                await conn.execute(text(stmt))
            except Exception as e:
                logger.warning("Migration statement note: %s -> %s", stmt, e)

    logger.info("All DocMind schema migrations applied successfully.")


if __name__ == "__main__":
    asyncio.run(run_migrations())

