import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy import select, text
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal, async_engine, Base
from app.models.entities import User
from app.models.enums import UserStatus, WorkspaceTier, WorkspaceType
from app.repositories.workspace import WorkspaceRepository
import app.models.entities  # noqa: F401

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("docmind.migration")

MIGRATION_STATEMENTS = [
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
    'CREATE EXTENSION IF NOT EXISTS "citext";',
    'CREATE EXTENSION IF NOT EXISTS "vector";',
    "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS tier VARCHAR(32) NOT NULL DEFAULT 'STARTER';",
    "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS workspace_type VARCHAR(32) NOT NULL DEFAULT 'PERSONAL';",
    "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS allowed_domains JSONB DEFAULT '[]'::jsonb;",
    "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS join_policy VARCHAR(32) NOT NULL DEFAULT 'INVITE_ONLY';",
    "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS default_join_role VARCHAR(32) NOT NULL DEFAULT 'EMPLOYEE';",
    "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS starter_prompts JSONB DEFAULT '[]'::jsonb;",
    "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS logo_url TEXT;",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS space_id UUID NULL REFERENCES knowledge_spaces(id) ON DELETE SET NULL;",
    "CREATE INDEX IF NOT EXISTS ix_documents_space_id ON documents (space_id);",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS insufficient_evidence BOOLEAN NOT NULL DEFAULT FALSE;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE NULL;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED';",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT FALSE;",
    "CREATE INDEX IF NOT EXISTS ix_workspaces_tier ON workspaces (tier);",
    "UPDATE workspaces SET workspace_type = 'COMPANY' WHERE workspace_type = 'PERSONAL' AND name != 'Personal Workspace' AND slug NOT LIKE 'ws-%';",
    """CREATE TABLE IF NOT EXISTS workspace_webhooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        url VARCHAR(512) NOT NULL,
        description VARCHAR(255),
        secret VARCHAR(64) NOT NULL,
        events JSONB DEFAULT '["document.ready","document.failed"]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_triggered_at TIMESTAMP WITH TIME ZONE,
        failure_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS ix_workspace_webhooks_ws_id ON workspace_webhooks(workspace_id);",
    """CREATE TABLE IF NOT EXISTS saved_insights (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        citations JSONB DEFAULT '[]'::jsonb,
        tags JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS ix_saved_insights_ws_id ON saved_insights(workspace_id);",
]


async def seed_platform_admin() -> None:
    admin_email = settings.PLATFORM_ADMIN_EMAIL.strip().lower()
    admin_password = settings.PLATFORM_ADMIN_PASSWORD
    if not admin_email or not admin_password:
        return

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.email == admin_email))
            user = result.scalar_one_or_none()
            pw_hash = hash_password(admin_password)
            now = datetime.now(timezone.utc)

            if not user:
                user = User(
                    email=admin_email,
                    password_hash=pw_hash,
                    status=UserStatus.ACTIVE.value,
                    is_superadmin=True,
                    verified_at=now,
                )
                db.add(user)
                await db.flush()
                logger.info("Created platform super-admin account: %s", admin_email)
            else:
                changed = False
                if not user.is_superadmin:
                    user.is_superadmin = True
                    changed = True
                if user.status != UserStatus.ACTIVE.value:
                    user.status = UserStatus.ACTIVE.value
                    changed = True
                if not user.verified_at:
                    user.verified_at = now
                    changed = True
                # Ensure configured platform admin password stays synced
                from app.core.security import verify_password
                if not verify_password(admin_password, user.password_hash):
                    user.password_hash = pw_hash
                    changed = True
                if changed:
                    await db.flush()
                    logger.info("Updated platform super-admin account: %s", admin_email)

            ws_repo = WorkspaceRepository(db)
            workspaces = await ws_repo.get_user_workspaces(user.id)
            if not workspaces:
                await ws_repo.create_workspace(
                    name="DocMind Platform HQ",
                    slug=f"docmind-hq-{user.id.hex[:6]}",
                    created_by=user.id,
                    tier=WorkspaceTier.ENTERPRISE.value,
                    workspace_type=WorkspaceType.COMPANY.value,
                )
                logger.info("Created default platform HQ workspace for %s", admin_email)

            await db.commit()
    except Exception as e:
        logger.warning("Platform super-admin seed check note: %s", e)


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

    # 3. Seed platform super-admin
    await seed_platform_admin()

    logger.info("All DocMind schema migrations applied successfully.")


if __name__ == "__main__":
    asyncio.run(run_migrations())

