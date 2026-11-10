import logging
import uuid
from typing import Any, Dict
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.adapters.storage.base import ObjectStorage
from app.core.security import generate_secure_token, hash_password
from app.models.entities import Document, User, Workspace, WorkspaceMember
from app.models.enums import DocumentStatus, UserStatus, WorkspaceRole
from app.repositories.chunk import ChunkRepository

logger = logging.getLogger("docmind.worker.delete_account")


async def handle_delete_account_job(
    db: AsyncSession,
    payload: Dict[str, Any],
    storage: ObjectStorage,
) -> None:
    user_id = uuid.UUID(payload["user_id"])
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        return

    chunk_repo = ChunkRepository(db)

    # 1. Inspect memberships
    memberships = (
        await db.execute(select(WorkspaceMember).where(WorkspaceMember.user_id == user_id))
    ).scalars().all()

    for mem in memberships:
        ws_id = mem.workspace_id
        member_count = await db.scalar(
            select(func.count(WorkspaceMember.user_id)).where(WorkspaceMember.workspace_id == ws_id)
        ) or 0

        if member_count <= 1:
            # Solo workspace -> purge R2/storage objects + delete workspace
            docs = (
                await db.execute(select(Document).where(Document.workspace_id == ws_id))
            ).scalars().all()
            for doc in docs:
                await chunk_repo.delete_by_document(doc.id)
                try:
                    await storage.delete_object(doc.object_key)
                except Exception as exc:
                    logger.warning("Failed deleting object %s: %s", doc.object_key, exc)

            ws = (await db.execute(select(Workspace).where(Workspace.id == ws_id))).scalar_one_or_none()
            if ws:
                await db.delete(ws)
        else:
            # Shared workspace -> transfer creator FK if needed and remove membership
            ws = (await db.execute(select(Workspace).where(Workspace.id == ws_id))).scalar_one_or_none()
            other_mem = (
                await db.execute(
                    select(WorkspaceMember)
                    .where(WorkspaceMember.workspace_id == ws_id, WorkspaceMember.user_id != user_id)
                    .order_by(WorkspaceMember.joined_at.asc())
                )
            ).scalars().first()
            if ws and ws.created_by == user_id and other_mem:
                ws.created_by = other_mem.user_id
                if mem.role == WorkspaceRole.OWNER.value:
                    other_mem.role = WorkspaceRole.OWNER.value
            await db.delete(mem)

    # 2. Anonymize deleted user record so email is freed and PII is cleared
    user.status = UserStatus.DELETED.value
    user.email = f"deleted-{user.id.hex}@deleted.docmind.local"
    user.password_hash = hash_password(generate_secure_token(32))
    user.verified_at = None
    await db.flush()
    logger.info("User account %s anonymized and solo workspaces purged.", user_id)

