import uuid
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import EntityNotFoundException
from app.models.entities import SavedInsight
from app.schemas.chat import CitationDTO
from app.schemas.insights import SavedInsightDTO


class InsightsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_insights(self, workspace_id: uuid.UUID) -> List[SavedInsightDTO]:
        result = await self.db.execute(
            select(SavedInsight)
            .where(SavedInsight.workspace_id == workspace_id)
            .order_by(SavedInsight.created_at.desc())
        )
        items = result.scalars().all()
        return [
            SavedInsightDTO(
                id=i.id,
                workspace_id=i.workspace_id,
                user_id=i.user_id,
                title=i.title,
                question=i.question,
                answer=i.answer,
                citations=[CitationDTO(**c) if isinstance(c, dict) else c for c in (i.citations or [])],
                tags=i.tags or [],
                created_at=i.created_at,
            )
            for i in items
        ]

    async def create_insight(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        title: str,
        question: str,
        answer: str,
        citations: Optional[List[CitationDTO]] = None,
        tags: Optional[List[str]] = None,
    ) -> SavedInsightDTO:
        cit_data = [c.model_dump(mode="json") if hasattr(c, "model_dump") else c for c in (citations or [])]
        insight = SavedInsight(
            workspace_id=workspace_id,
            user_id=user_id,
            title=title.strip() or "Saved Insight",
            question=question.strip(),
            answer=answer.strip(),
            citations=cit_data,
            tags=tags or [],
        )
        self.db.add(insight)
        await self.db.flush()

        return SavedInsightDTO(
            id=insight.id,
            workspace_id=insight.workspace_id,
            user_id=insight.user_id,
            title=insight.title,
            question=insight.question,
            answer=insight.answer,
            citations=citations or [],
            tags=insight.tags or [],
            created_at=insight.created_at,
        )

    async def delete_insight(self, workspace_id: uuid.UUID, insight_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(SavedInsight).where(
                SavedInsight.id == insight_id,
                SavedInsight.workspace_id == workspace_id,
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise EntityNotFoundException("Insight", insight_id)

        await self.db.delete(item)
        await self.db.flush()

