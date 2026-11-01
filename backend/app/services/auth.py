import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.exceptions import DocMindException
from app.core.security import (
    create_access_token,
    generate_secure_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.entities import RefreshSession, User, Workspace
from app.models.enums import UserStatus, WorkspaceRole
from app.repositories.user import UserRepository
from app.repositories.workspace import WorkspaceRepository
from app.schemas.auth import TokenResponse, UserSummaryDTO, WorkspaceSummaryDTO


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.workspace_repo = WorkspaceRepository(db)

    async def register(self, email: str, password: str) -> Tuple[User, Workspace, str]:
        existing = await self.user_repo.get_by_email(email)
        if existing:
            raise DocMindException(
                status_code=409,
                code="EMAIL_ALREADY_EXISTS",
                title="Account Exists",
                detail="An account with this email address already exists."
            )

        password_hash = hash_password(password)
        user = await self.user_repo.create_user(email, password_hash)

        # Auto-create personal workspace per FR-006
        workspace_name = "Personal Workspace"
        workspace_slug = f"ws-{user.id.hex[:8]}"
        workspace = await self.workspace_repo.create_workspace(
            name=workspace_name,
            slug=workspace_slug,
            created_by=user.id
        )

        verification_token = generate_secure_token(32)
        return user, workspace, verification_token

    async def login(self, email: str, password: str) -> Tuple[TokenResponse, str, UserSummaryDTO]:
        user = await self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise DocMindException(
                status_code=401,
                code="INVALID_CREDENTIALS",
                title="Authentication Failed",
                detail="Incorrect email or password."
            )

        if user.status == UserStatus.SUSPENDED.value:
            raise DocMindException(
                status_code=403,
                code="ACCOUNT_SUSPENDED",
                title="Account Suspended",
                detail="This account has been suspended."
            )

        workspaces = await self.workspace_repo.get_user_workspaces(user.id)
        active_ws, active_role = workspaces[0] if workspaces else (None, None)
        active_ws_id = str(active_ws.id) if active_ws else None

        access_token = create_access_token(user_id=str(user.id), workspace_id=active_ws_id)
        
        # Issue rotating refresh token
        refresh_raw = generate_secure_token(48)
        refresh_hash = hash_token(refresh_raw)
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        await self.user_repo.create_refresh_session(user.id, refresh_hash, expires_at)

        token_resp = TokenResponse(
            access_token=access_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )

        ws_dto = None
        if active_ws:
            ws_dto = WorkspaceSummaryDTO(
                id=active_ws.id,
                name=active_ws.name,
                slug=active_ws.slug,
                role=active_role or WorkspaceRole.OWNER.value
            )

        user_dto = UserSummaryDTO(
            id=user.id,
            email=user.email,
            status=user.status,
            verified=(user.verified_at is not None),
            active_workspace=ws_dto
        )

        return token_resp, refresh_raw, user_dto

    async def refresh_session(self, raw_refresh_token: str) -> Tuple[TokenResponse, str]:
        t_hash = hash_token(raw_refresh_token)
        session = await self.user_repo.get_refresh_session(t_hash)
        
        if not session or session.expires_at < datetime.now(timezone.utc):
            raise DocMindException(
                status_code=401,
                code="INVALID_SESSION",
                title="Session Expired",
                detail="Your refresh session has expired or is invalid. Please log in again."
            )

        user = await self.user_repo.get_by_id(session.user_id)
        if not user:
            raise DocMindException(status_code=401, code="USER_NOT_FOUND", title="Invalid Session", detail="User not found.")

        workspaces = await self.workspace_repo.get_user_workspaces(user.id)
        active_ws, _ = workspaces[0] if workspaces else (None, None)
        active_ws_id = str(active_ws.id) if active_ws else None

        # Rotate refresh token: revoke current session, issue new session
        new_refresh_raw = generate_secure_token(48)
        new_refresh_hash = hash_token(new_refresh_raw)
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        new_session = await self.user_repo.create_refresh_session(user.id, new_refresh_hash, expires_at)
        await self.user_repo.revoke_session(session.id, replaced_by=new_session.id)

        new_access_token = create_access_token(user_id=str(user.id), workspace_id=active_ws_id)
        
        return TokenResponse(
            access_token=new_access_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        ), new_refresh_raw

    async def logout(self, raw_refresh_token: str) -> None:
        if raw_refresh_token:
            t_hash = hash_token(raw_refresh_token)
            session = await self.user_repo.get_refresh_session(t_hash)
            if session:
                await self.user_repo.revoke_session(session.id)
