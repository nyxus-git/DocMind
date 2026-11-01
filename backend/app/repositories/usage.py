import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import UsageEvent


class UsageRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_event(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        event_type: str,
        provider: str,
        model: str,
        units: int,
        cost_usd: Decimal = Decimal("0.0"),
        request_id: Optional[str] = None
    ) -> UsageEvent:
        event = UsageEvent(
            workspace_id=workspace_id,
            user_id=user_id,
            event_type=event_type,
            provider=provider,
            model=model,
            units=units,
            cost_usd=cost_usd,
            request_id=request_id
        )
        self.db.add(event)
        await self.db.flush()
        return event

    async def count_monthly_questions(self, user_id: uuid.UUID) -> int:
        now = datetime.now(timezone.utc)
        first_of_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

        result = await self.db.execute(
            select(func.count(UsageEvent.id)).where(
                UsageEvent.user_id == user_id,
                UsageEvent.event_type == "question",
                UsageEvent.created_at >= first_of_month
            )
        )
        return int(result.scalar_one() or 0)
