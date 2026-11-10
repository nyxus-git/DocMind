import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import ApiKey


class ApiKeyRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_key(
        self,
        workspace_id: uuid.UUID,
        created_by: uuid.UUID,
        name: str,
        key_prefix: str,
        key_hash: str,
        scopes: Optional[List[str]] = None,
    ) -> ApiKey:
        record = ApiKey(
            workspace_id=workspace_id,
            created_by=created_by,
            name=name.strip(),
            key_prefix=key_prefix,
            key_hash=key_hash,
            scopes=scopes or ["read", "write"],
        )
        self.db.add(record)
        await self.db.flush()
        return record

    async def list_keys(self, workspace_id: uuid.UUID) -> List[ApiKey]:
        result = await self.db.execute(
            select(ApiKey)
            .where(ApiKey.workspace_id == workspace_id, ApiKey.revoked_at.is_(None))
            .order_by(ApiKey.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_active_by_hash(self, key_hash: str) -> Optional[ApiKey]:
        result = await self.db.execute(
            select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.revoked_at.is_(None))
        )
        record = result.scalar_one_or_none()
        if record:
            record.last_used_at = datetime.now(timezone.utc)
            await self.db.flush()
        return record

    async def revoke_key(self, workspace_id: uuid.UUID, key_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(ApiKey).where(
                ApiKey.id == key_id,
                ApiKey.workspace_id == workspace_id,
                ApiKey.revoked_at.is_(None),
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            return False
        record.revoked_at = datetime.now(timezone.utc)
        await self.db.flush()
        return True

