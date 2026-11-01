import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import RefreshSession, User, Workspace, WorkspaceMember
from app.models.enums import UserStatus, WorkspaceRole


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: uuid.UUID) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.id == user_id, User.status != UserStatus.DELETED.value))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        norm_email = email.strip().lower()
        result = await self.db.execute(select(User).where(User.email == norm_email))
        return result.scalar_one_or_none()

    async def create_user(self, email: str, password_hash: str) -> User:
        norm_email = email.strip().lower()
        user = User(
            email=norm_email,
            password_hash=password_hash,
            status=UserStatus.UNVERIFIED.value
        )
        self.db.add(user)
        await self.db.flush()
        return user

    async def mark_verified(self, user_id: uuid.UUID) -> Optional[User]:
        user = await self.get_by_id(user_id)
        if user:
            user.verified_at = datetime.now(timezone.utc)
            user.status = UserStatus.ACTIVE.value
            await self.db.flush()
        return user

    async def update_password(self, user_id: uuid.UUID, new_password_hash: str) -> None:
        await self.db.execute(
            update(User)
            .where(User.id == user_id)
            .values(password_hash=new_password_hash, updated_at=datetime.now(timezone.utc))
        )
        await self.db.flush()

    async def create_refresh_session(self, user_id: uuid.UUID, token_hash: str, expires_at: datetime) -> RefreshSession:
        session = RefreshSession(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at
        )
        self.db.add(session)
        await self.db.flush()
        return session

    async def get_refresh_session(self, token_hash: str) -> Optional[RefreshSession]:
        result = await self.db.execute(
            select(RefreshSession).where(
                RefreshSession.token_hash == token_hash,
                RefreshSession.revoked_at.is_(None)
            )
        )
        return result.scalar_one_or_none()

    async def revoke_session(self, session_id: uuid.UUID, replaced_by: Optional[uuid.UUID] = None) -> None:
        await self.db.execute(
            update(RefreshSession)
            .where(RefreshSession.id == session_id)
            .values(revoked_at=datetime.now(timezone.utc), replaced_by=replaced_by)
        )
        await self.db.flush()

    async def revoke_all_user_sessions(self, user_id: uuid.UUID) -> None:
        await self.db.execute(
            update(RefreshSession)
            .where(RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(timezone.utc))
        )
        await self.db.flush()
