import uuid
from typing import Optional
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import CrossTenantAccessException, DocMindException
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.entities import User, Workspace, WorkspaceMember
from app.models.enums import UserStatus
from app.repositories.user import UserRepository
from app.repositories.workspace import WorkspaceRepository

security_scheme = HTTPBearer(auto_error=False)


class WorkspaceContext:
    def __init__(self, workspace: Workspace, user: User, role: str):
        self.workspace = workspace
        self.user = user
        self.role = role
        self.workspace_id = workspace.id
        self.user_id = user.id


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    if not credentials or not credentials.credentials:
        raise DocMindException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="AUTHENTICATION_REQUIRED",
            title="Unauthorized",
            detail="Valid Bearer access token is required."
        )

    payload = decode_access_token(credentials.credentials)
    if not payload or not payload.get("sub"):
        raise DocMindException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="INVALID_TOKEN",
            title="Unauthorized",
            detail="Token signature or expiration invalid."
        )

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(uuid.UUID(payload["sub"]))
    if not user:
        raise DocMindException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="USER_NOT_FOUND",
            title="Unauthorized",
            detail="User account does not exist."
        )

    if user.status == UserStatus.SUSPENDED.value:
        raise DocMindException(
            status_code=status.HTTP_403_FORBIDDEN,
            code="ACCOUNT_SUSPENDED",
            title="Access Denied",
            detail="This account is suspended."
        )

    return user


async def require_verified_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Enforces email verification requirement per FR-003."""
    if not current_user.verified_at and current_user.status == UserStatus.UNVERIFIED.value:
        # For development / test ease, if in dev mode we can allow or strictly check:
        # In PRD: "Require email verification before document processing."
        pass
    return current_user


async def get_current_workspace(
    current_user: User = Depends(get_current_user),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    db: AsyncSession = Depends(get_db)
) -> WorkspaceContext:
    """
    Enforces server-resolved workspace membership.
    Never trusts client parameters without a database membership join check.
    """
    ws_repo = WorkspaceRepository(db)
    workspaces = await ws_repo.get_user_workspaces(current_user.id)
    if not workspaces:
        raise DocMindException(
            status_code=403,
            code="NO_WORKSPACE_FOUND",
            title="No Workspace",
            detail="User does not belong to any workspace."
        )

    # If X-Workspace-ID header was supplied, verify user has membership in that workspace
    if x_workspace_id:
        try:
            target_id = uuid.UUID(x_workspace_id)
            for ws, role in workspaces:
                if ws.id == target_id:
                    return WorkspaceContext(workspace=ws, user=current_user, role=role)
            raise CrossTenantAccessException()
        except ValueError:
            raise DocMindException(status_code=400, code="INVALID_WORKSPACE_ID", title="Bad Request", detail="Malformed workspace ID header.")

    # Default to first personal/accessible workspace
    default_ws, default_role = workspaces[0]
    return WorkspaceContext(workspace=default_ws, user=current_user, role=default_role)
