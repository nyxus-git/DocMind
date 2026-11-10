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

    async def count_monthly_questions(self, workspace_id: uuid.UUID) -> int:
        now = datetime.now(timezone.utc)
        first_of_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

        result = await self.db.execute(
            select(func.count(UsageEvent.id)).where(
                UsageEvent.workspace_id == workspace_id,
                UsageEvent.event_type.in_(["question", "comparison", "extraction"]),
                UsageEvent.created_at >= first_of_month
            )
        )
        return int(result.scalar_one() or 0)

    async def get_monthly_cost_usd(self, workspace_id: Optional[uuid.UUID] = None) -> Decimal:
        now = datetime.now(timezone.utc)
        first_of_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        query = select(func.coalesce(func.sum(UsageEvent.cost_usd), 0)).where(UsageEvent.created_at >= first_of_month)
        if workspace_id:
            query = query.where(UsageEvent.workspace_id == workspace_id)
        result = await self.db.execute(query)
        val = result.scalar_one_or_none()
        return Decimal(str(val or "0.0"))


def calculate_llm_cost_usd(model: str, input_tokens: int, output_tokens: int) -> Decimal:
    """Computes approximate USD cost per request based on Gemini token pricing."""
    m = (model or "").lower()
    if "pro" in m:
        in_rate = Decimal("0.00000125")   # $1.25 / 1M input
        out_rate = Decimal("0.00000500")  # $5.00 / 1M output
    else:
        in_rate = Decimal("0.000000075")  # $0.075 / 1M input
        out_rate = Decimal("0.00000030")  # $0.30 / 1M output
    cost = (Decimal(max(0, input_tokens)) * in_rate) + (Decimal(max(0, output_tokens)) * out_rate)
    return cost.quantize(Decimal("0.000001"))
