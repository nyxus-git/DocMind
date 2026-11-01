import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.entities import Conversation, Document, Message, MessageCitation
from app.models.enums import DocumentStatus


class ConversationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_conversation(
        self,
        workspace_id: uuid.UUID,
        created_by: uuid.UUID,
        title: str = "New Conversation",
        scope_mode: str = "all",
        selected_doc_ids: Optional[List[uuid.UUID]] = None
    ) -> Conversation:
        conv = Conversation(
            workspace_id=workspace_id,
            created_by=created_by,
            title=title,
            scope_mode=scope_mode,
            selected_doc_ids=[str(i) for i in (selected_doc_ids or [])]
        )
        self.db.add(conv)
        await self.db.flush()
        return conv

    async def list_conversations(self, workspace_id: uuid.UUID, limit: int = 50) -> List[Conversation]:
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.workspace_id == workspace_id)
            .order_by(Conversation.updated_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_by_id(self, workspace_id: uuid.UUID, conversation_id: uuid.UUID) -> Optional[Conversation]:
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.id == conversation_id, Conversation.workspace_id == workspace_id)
            .options(selectinload(Conversation.messages).selectinload(Message.citations))
        )
        return result.scalar_one_or_none()

    async def update_conversation(
        self,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
        title: Optional[str] = None,
        scope_mode: Optional[str] = None,
        selected_doc_ids: Optional[List[uuid.UUID]] = None
    ) -> Optional[Conversation]:
        conv = await self.get_by_id(workspace_id, conversation_id)
        if not conv:
            return None
        if title:
            conv.title = title
        if scope_mode:
            conv.scope_mode = scope_mode
        if selected_doc_ids is not None:
            conv.selected_doc_ids = [str(i) for i in selected_doc_ids]
        conv.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return conv

    async def delete_conversation(self, workspace_id: uuid.UUID, conversation_id: uuid.UUID) -> bool:
        conv = await self.get_by_id(workspace_id, conversation_id)
        if not conv:
            return False
        await self.db.delete(conv)
        await self.db.flush()
        return True

    async def create_message(
        self,
        conversation_id: uuid.UUID,
        role: str,
        content: str,
        model: Optional[str] = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        latency_ms: int = 0,
        request_id: Optional[str] = None,
        status: str = "completed"
    ) -> Message:
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            status=status,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            request_id=request_id
        )
        self.db.add(msg)
        await self.db.flush()
        return msg

    async def add_citations(
        self,
        message_id: uuid.UUID,
        citations_data: List[Dict[str, Any]]
    ) -> None:
        for c in citations_data:
            cit = MessageCitation(
                message_id=message_id,
                chunk_id=c.get("chunk_id"),
                document_id=c["document_id"],
                source_label=c["source_label"],
                claim_text=c.get("claim_text"),
                filename=c["filename"],
                page_start=c.get("page_start"),
                page_end=c.get("page_end"),
                section_path=c.get("section_path"),
                excerpt=c["excerpt"]
            )
            self.db.add(cit)
        await self.db.flush()
