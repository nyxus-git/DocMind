import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.v1.dependencies import WorkspaceContext, get_current_workspace, require_write_access
from app.core.exceptions import DocMindException, EntityNotFoundException
from app.db.session import get_db
from app.models.entities import Conversation, Message
from app.repositories.conversation import ConversationRepository
from app.repositories.workspace import WorkspaceRepository
from app.schemas.chat import (
    CitationDTO,
    ConversationDTO,
    ConversationExportResponse,
    CreateConversationRequest,
    MessageDTO,
    MessageFeedbackRequest,
    MessageFeedbackResponse,
    SendMessageRequest,
    SendMessageResponse,
    UpdateConversationRequest,
)
from app.services.ai_chat import ChatService

router = APIRouter(prefix="/conversations", tags=["Chat & Conversations"])


@router.post("", response_model=ConversationDTO, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    req: CreateConversationRequest,
    ctx: WorkspaceContext = Depends(require_write_access),
    db: AsyncSession = Depends(get_db)
):
    conv_repo = ConversationRepository(db)
    conv = await conv_repo.create_conversation(
        workspace_id=ctx.workspace.id,
        created_by=ctx.user.id,
        title=req.title or "New Conversation",
        scope_mode=req.scope_mode,
        selected_doc_ids=req.selected_doc_ids
    )
    return ConversationDTO(
        id=conv.id,
        workspace_id=conv.workspace_id,
        title=conv.title,
        scope_mode=conv.scope_mode,
        selected_doc_ids=[uuid.UUID(i) for i in (conv.selected_doc_ids or [])],
        created_at=conv.created_at,
        updated_at=conv.updated_at
    )


@router.get("", response_model=List[ConversationDTO])
async def list_conversations(
    limit: int = Query(50, ge=1, le=100),
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    conv_repo = ConversationRepository(db)
    convs = await conv_repo.list_conversations(ctx.workspace.id, limit=limit, user_id=ctx.user.id)
    return [
        ConversationDTO(
            id=c.id,
            workspace_id=c.workspace_id,
            title=c.title,
            scope_mode=c.scope_mode,
            selected_doc_ids=[uuid.UUID(i) for i in (c.selected_doc_ids or [])],
            created_at=c.created_at,
            updated_at=c.updated_at
        )
        for c in convs
    ]


@router.get("/{conversation_id}", response_model=ConversationDTO)
async def get_conversation(
    conversation_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    conv_repo = ConversationRepository(db)
    conv = await conv_repo.get_by_id(ctx.workspace.id, conversation_id)
    if not conv or conv.created_by != ctx.user.id:
        raise EntityNotFoundException("Conversation", conversation_id)

    feedback_map = await conv_repo.get_feedback_map([m.id for m in conv.messages], ctx.user.id)
    message_dtos: List[MessageDTO] = []
    for msg in conv.messages:
        cit_dtos = [
            CitationDTO(
                citation_id=c.id,
                document_id=c.document_id,
                filename=c.filename,
                page_start=c.page_start,
                page_end=c.page_end,
                section=c.section_path,
                excerpt=c.excerpt,
                source_label=c.source_label,
                is_source_deleted=(c.chunk_id is None)
            )
            for c in msg.citations
        ]
        message_dtos.append(MessageDTO(
            id=msg.id,
            conversation_id=msg.conversation_id,
            role=msg.role,
            content=msg.content,
            status=msg.status,
            user_feedback=feedback_map.get(msg.id),
            citations=cit_dtos,
            created_at=msg.created_at
        ))

    return ConversationDTO(
        id=conv.id,
        workspace_id=conv.workspace_id,
        title=conv.title,
        scope_mode=conv.scope_mode,
        selected_doc_ids=[uuid.UUID(i) for i in (conv.selected_doc_ids or [])],
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=message_dtos
    )


@router.patch("/{conversation_id}", response_model=ConversationDTO)
async def update_conversation(
    conversation_id: uuid.UUID,
    req: UpdateConversationRequest,
    ctx: WorkspaceContext = Depends(require_write_access),
    db: AsyncSession = Depends(get_db)
):
    conv_repo = ConversationRepository(db)
    existing = await conv_repo.get_by_id(ctx.workspace.id, conversation_id)
    if not existing or existing.created_by != ctx.user.id:
        raise EntityNotFoundException("Conversation", conversation_id)

    conv = await conv_repo.update_conversation(
        workspace_id=ctx.workspace.id,
        conversation_id=conversation_id,
        title=req.title,
        scope_mode=req.scope_mode,
        selected_doc_ids=req.selected_doc_ids
    )
    if not conv:
        raise EntityNotFoundException("Conversation", conversation_id)

    return ConversationDTO(
        id=conv.id,
        workspace_id=conv.workspace_id,
        title=conv.title,
        scope_mode=conv.scope_mode,
        selected_doc_ids=[uuid.UUID(i) for i in (conv.selected_doc_ids or [])],
        created_at=conv.created_at,
        updated_at=conv.updated_at
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_write_access),
    db: AsyncSession = Depends(get_db)
):
    conv_repo = ConversationRepository(db)
    existing = await conv_repo.get_by_id(ctx.workspace.id, conversation_id)
    if not existing or existing.created_by != ctx.user.id:
        raise EntityNotFoundException("Conversation", conversation_id)
    deleted = await conv_repo.delete_conversation(ctx.workspace.id, conversation_id)
    if not deleted:
        raise EntityNotFoundException("Conversation", conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{conversation_id}/messages", response_model=SendMessageResponse)
async def send_message(
    conversation_id: uuid.UUID,
    req: SendMessageRequest,
    ctx: WorkspaceContext = Depends(require_write_access),
    db: AsyncSession = Depends(get_db)
):
    conv_repo = ConversationRepository(db)
    existing = await conv_repo.get_by_id(ctx.workspace.id, conversation_id)
    if not existing or existing.created_by != ctx.user.id:
        raise EntityNotFoundException("Conversation", conversation_id)

    allowed_spaces = await WorkspaceRepository(db).get_accessible_space_ids(ctx.workspace.id, ctx.user.id, ctx.role)
    chat_service = ChatService(db)
    return await chat_service.send_message(
        workspace_id=ctx.workspace.id,
        user_id=ctx.user.id,
        conversation_id=conversation_id,
        content=req.content,
        document_ids=req.document_ids,
        idempotency_key=req.idempotency_key,
        allowed_space_ids=allowed_spaces,
        space_id=req.space_id,
        focus_mode=req.focus_mode,
    )


@router.get("/{conversation_id}/export", response_model=ConversationExportResponse)
async def export_conversation(
    conversation_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    conv_repo = ConversationRepository(db)
    existing = await conv_repo.get_by_id(ctx.workspace.id, conversation_id)
    if not existing or existing.created_by != ctx.user.id:
        raise EntityNotFoundException("Conversation", conversation_id)

    chat_service = ChatService(db)
    return await chat_service.export_conversation(ctx.workspace.id, conversation_id)



@router.post("/{conversation_id}/messages/{message_id}/feedback", response_model=MessageFeedbackResponse)
async def submit_message_feedback(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    req: MessageFeedbackRequest,
    ctx: WorkspaceContext = Depends(require_write_access),
    db: AsyncSession = Depends(get_db),
):
    if req.rating not in (1, -1):
        raise DocMindException(status_code=400, code="INVALID_RATING", title="Bad Request", detail="Rating must be 1 or -1.")

    conv_repo = ConversationRepository(db)
    conv = await conv_repo.get_by_id(ctx.workspace.id, conversation_id)
    if not conv or conv.created_by != ctx.user.id:
        raise EntityNotFoundException("Conversation", conversation_id)

    target_msg = next((m for m in conv.messages if m.id == message_id and m.role == "assistant"), None)
    if not target_msg:
        raise EntityNotFoundException("Message", message_id)

    question_text: Optional[str] = None
    for m in conv.messages:
        if m.id == target_msg.id:
            break
        if m.role == "user":
            question_text = m.content

    await conv_repo.upsert_feedback(
        workspace_id=ctx.workspace.id,
        conversation_id=conv.id,
        message_id=target_msg.id,
        user_id=ctx.user.id,
        rating=req.rating,
        comment=req.comment,
        question_text=question_text,
    )
    return MessageFeedbackResponse(message_id=target_msg.id, rating=req.rating)


@router.get("/{conversation_id}/export")
async def export_conversation_markdown(
    conversation_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    conv_repo = ConversationRepository(db)
    conv = await conv_repo.get_by_id(ctx.workspace.id, conversation_id)
    if not conv or conv.created_by != ctx.user.id:
        raise EntityNotFoundException("Conversation", conversation_id)

    lines = [f"# DocMind Chat Export: {conv.title}", f"Exported: {conv.updated_at.isoformat()}\n"]
    for msg in conv.messages:
        role_label = "**User**" if msg.role == "user" else "**DocMind Assistant**"
        lines.append(f"### {role_label} ({msg.created_at.strftime('%Y-%m-%d %H:%M:%S')})\n")
        lines.append(f"{msg.content}\n")
        if msg.citations:
            lines.append("#### Citations:")
            for cit in msg.citations:
                page_info = f", Page {cit.page_start}" if cit.page_start else ""
                lines.append(f"- **[{cit.source_label}]** *{cit.filename}*{page_info}: \"{cit.excerpt}\"")
        lines.append("\n---\n")

    md_content = "\n".join(lines)
    return Response(content=md_content, media_type="text/markdown", headers={
        "Content-Disposition": f'attachment; filename="docmind_chat_{conversation_id}.md"'
    })
