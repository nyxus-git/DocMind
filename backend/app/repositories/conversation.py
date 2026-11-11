import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.entities import Conversation, Document, Message, MessageCitation, MessageFeedback, User
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

    async def list_conversations(
        self,
        workspace_id: uuid.UUID,
        limit: int = 50,
        user_id: Optional[uuid.UUID] = None,
    ) -> List[Conversation]:
        query = select(Conversation).where(Conversation.workspace_id == workspace_id)
        if user_id is not None:
            query = query.where(Conversation.created_by == user_id)
        result = await self.db.execute(query.order_by(Conversation.updated_at.desc()).limit(limit))
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
        status: str = "completed",
        insufficient_evidence: bool = False,
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
            insufficient_evidence=insufficient_evidence,
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

    async def upsert_feedback(
        self,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
        message_id: uuid.UUID,
        user_id: uuid.UUID,
        rating: int,
        comment: Optional[str] = None,
        question_text: Optional[str] = None,
    ) -> MessageFeedback:
        res = await self.db.execute(
            select(MessageFeedback).where(
                MessageFeedback.message_id == message_id,
                MessageFeedback.user_id == user_id,
            )
        )
        rec = res.scalar_one_or_none()
        if rec:
            rec.rating = rating
            if comment is not None:
                rec.comment = comment
            if question_text is not None:
                rec.question_text = question_text
            rec.updated_at = datetime.now(timezone.utc)
        else:
            rec = MessageFeedback(
                workspace_id=workspace_id,
                conversation_id=conversation_id,
                message_id=message_id,
                user_id=user_id,
                rating=rating,
                comment=comment,
                question_text=question_text,
            )
            self.db.add(rec)
        await self.db.flush()
        return rec

    async def get_feedback_map(self, message_ids: List[uuid.UUID], user_id: uuid.UUID) -> Dict[uuid.UUID, int]:
        if not message_ids:
            return {}
        res = await self.db.execute(
            select(MessageFeedback.message_id, MessageFeedback.rating).where(
                MessageFeedback.message_id.in_(message_ids),
                MessageFeedback.user_id == user_id,
            )
        )
        return {row[0]: int(row[1]) for row in res.all()}

    async def list_knowledge_gaps(self, workspace_id: uuid.UUID, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns negative feedback reports and unanswered (insufficient_evidence) questions."""
        gaps: List[Dict[str, Any]] = []
        seen_msg_ids = set()

        fb_res = await self.db.execute(
            select(MessageFeedback, Message, User.email)
            .join(Message, MessageFeedback.message_id == Message.id)
            .join(User, MessageFeedback.user_id == User.id)
            .where(MessageFeedback.workspace_id == workspace_id, MessageFeedback.rating == -1)
            .order_by(MessageFeedback.created_at.desc())
            .limit(limit)
        )
        for fb, msg, user_email in fb_res.all():
            seen_msg_ids.add(msg.id)
            gaps.append({
                "id": fb.id,
                "message_id": msg.id,
                "conversation_id": fb.conversation_id,
                "question": fb.question_text or "(Question archived)",
                "answer_excerpt": (msg.content or "")[:240],
                "reason": "NEGATIVE_FEEDBACK",
                "comment": fb.comment,
                "user_email": user_email,
                "created_at": fb.created_at,
            })

        insuff_res = await self.db.execute(
            select(Message, Conversation, User.email)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .join(User, Conversation.created_by == User.id)
            .where(
                Conversation.workspace_id == workspace_id,
                Message.role == "assistant",
                Message.insufficient_evidence.is_(True),
            )
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        for msg, conv, user_email in insuff_res.all():
            if msg.id in seen_msg_ids:
                continue
            prev_q = (
                await self.db.execute(
                    select(Message.content)
                    .where(
                        Message.conversation_id == conv.id,
                        Message.role == "user",
                        Message.created_at <= msg.created_at,
                    )
                    .order_by(Message.created_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            gaps.append({
                "id": msg.id,
                "message_id": msg.id,
                "conversation_id": conv.id,
                "question": prev_q or conv.title,
                "answer_excerpt": (msg.content or "")[:240],
                "reason": "INSUFFICIENT_EVIDENCE",
                "comment": None,
                "user_email": user_email,
                "created_at": msg.created_at,
            })

        gaps.sort(key=lambda g: g["created_at"], reverse=True)
        return gaps[:limit]
