import uuid
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import AuditEvent, User


class AuditRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_event(
        self,
        workspace_id: uuid.UUID,
        action: str,
        target_type: str,
        actor_user_id: Optional[uuid.UUID] = None,
        target_id: Optional[uuid.UUID] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> AuditEvent:
        event = AuditEvent(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            audit_metadata=metadata or {}
        )
        self.db.add(event)
        await self.db.flush()
        return event

    async def list_events(
        self,
        workspace_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0
    ) -> List[Tuple[AuditEvent, Optional[str]]]:
        """Lists audit events joined with actor email."""
        query = (
            select(AuditEvent, User.email)
            .outerjoin(User, AuditEvent.actor_user_id == User.id)
            .where(AuditEvent.workspace_id == workspace_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(query)
        return list(result.all())
