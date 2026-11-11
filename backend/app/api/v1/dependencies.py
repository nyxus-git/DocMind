import uuid
from typing import Optional
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.exceptions import CrossTenantAccessException, DocMindException
from app.core.security import decode_access_token, hash_token
from app.db.session import get_db
from app.models.entities import User, Workspace, WorkspaceMember
from app.models.enums import UserStatus, WorkspaceRole
from app.repositories.api_key import ApiKeyRepository
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


async def _authenticate_api_key(raw_key: str, db: AsyncSession) -> User:
    api_repo = ApiKeyRepository(db)
    ws_repo = WorkspaceRepository(db)
    user_repo = UserRepository(db)

    key_rec = await api_repo.get_active_by_hash(hash_token(raw_key.strip()))
    if not key_rec:
        raise DocMindException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="INVALID_API_KEY",
            title="Unauthorized",
            detail="API key is invalid or revoked."
        )

    user = await user_repo.get_by_id(key_rec.created_by) if key_rec.created_by else None
    if not user or user.status == UserStatus.SUSPENDED.value:
        raise DocMindException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="API_KEY_OWNER_INACTIVE",
            title="Unauthorized",
            detail="API key owner account is inactive or suspended."
        )

    # Pin workspace scope onto user instance transiently for get_current_workspace
    scopes = key_rec.scopes or ["read", "write"]
    scoped_role = WorkspaceRole.ADMIN.value if "write" in scopes else WorkspaceRole.VIEWER.value
    setattr(user, "_api_key_ws_id", key_rec.workspace_id)
    setattr(user, "_api_key_role", scoped_role)
    return user


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db)
) -> User:
    if x_api_key and x_api_key.strip():
        return await _authenticate_api_key(x_api_key, db)

    if not credentials or not credentials.credentials:
        raise DocMindException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="AUTHENTICATION_REQUIRED",
            title="Unauthorized",
            detail="Valid Bearer access token or X-API-Key is required."
        )

    raw_token = credentials.credentials.strip()
    if raw_token.startswith("dm_live_"):
        return await _authenticate_api_key(raw_token, db)

    payload = decode_access_token(raw_token)
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
    """Enforces email verification requirement when enabled via REQUIRE_EMAIL_VERIFICATION."""
    if settings.REQUIRE_EMAIL_VERIFICATION and not current_user.verified_at:
        raise DocMindException(
            status_code=status.HTTP_403_FORBIDDEN,
            code="EMAIL_VERIFICATION_REQUIRED",
            title="Verification Required",
            detail="Please verify your email address before performing this action."
        )
    return current_user


async def get_current_workspace(
    current_user: User = Depends(get_current_user),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    db: AsyncSession = Depends(get_db)
) -> WorkspaceContext:
    """
    Enforces server-resolved workspace membership or API-key scoped workspace binding.
    Never trusts client parameters without a database membership join check.
    """
    ws_repo = WorkspaceRepository(db)

    api_key_ws_id = getattr(current_user, "_api_key_ws_id", None)
    if api_key_ws_id is not None:
        if x_workspace_id and str(api_key_ws_id) != x_workspace_id.strip():
            raise CrossTenantAccessException()
        ws = await ws_repo.get_by_id(api_key_ws_id)
        if not ws:
            raise CrossTenantAccessException()
        api_key_role = getattr(current_user, "_api_key_role", WorkspaceRole.ADMIN.value)
        return WorkspaceContext(workspace=ws, user=current_user, role=api_key_role)

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


async def require_write_access(
    ctx: WorkspaceContext = Depends(get_current_workspace),
) -> WorkspaceContext:
    """Blocks VIEWER role from mutating workspace resources or invoking billed AI queries."""
    if settings.REQUIRE_EMAIL_VERIFICATION and not ctx.user.verified_at:
        raise DocMindException(
            status_code=status.HTTP_403_FORBIDDEN,
            code="EMAIL_VERIFICATION_REQUIRED",
            title="Verification Required",
            detail="Please verify your email address before modifying workspace data or asking AI questions."
        )
    if ctx.role == WorkspaceRole.VIEWER.value:
        raise DocMindException(
            status_code=status.HTTP_403_FORBIDDEN,
            code="INSUFFICIENT_PERMISSIONS",
            title="Read-Only Access",
            detail="Workspace Viewers have read-only permissions and cannot upload, modify documents, or run AI queries."
        )
    return ctx


async def require_document_write_access(
    ctx: WorkspaceContext = Depends(require_write_access),
) -> WorkspaceContext:
    """Blocks EMPLOYEE and VIEWER roles from uploading, editing, or deleting company documents."""
    if ctx.role == WorkspaceRole.EMPLOYEE.value:
        raise DocMindException(
            status_code=status.HTTP_403_FORBIDDEN,
            code="INSUFFICIENT_PERMISSIONS",
            title="Company Admin or Contributor Required",
            detail="Employees can read and ask AI questions, but cannot upload, modify, or delete company documents."
        )
    return ctx


async def require_company_admin(
    ctx: WorkspaceContext = Depends(get_current_workspace),
) -> WorkspaceContext:
    """Restricts company management endpoints to workspace OWNER and ADMIN roles."""
    if ctx.role not in (WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value):
        raise DocMindException(
            status_code=status.HTTP_403_FORBIDDEN,
            code="INSUFFICIENT_PERMISSIONS",
            title="Company Admin Required",
            detail="Only Company Owners and Admins can manage company settings, spaces, or employees."
        )
    return ctx


async def require_platform_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Enforces platform super-admin privileges.
    Strictly denies regular tenant owners or members.
    """
    is_super = current_user.is_superadmin or (
        bool(settings.PLATFORM_ADMIN_EMAIL) and current_user.email.lower() == settings.PLATFORM_ADMIN_EMAIL.lower()
    )
    if not is_super:
        raise DocMindException(
            status_code=status.HTTP_403_FORBIDDEN,
            code="PLATFORM_ADMIN_REQUIRED",
            title="Access Denied",
            detail="Platform Administrator privileges are required to access this resource."
        )
    return current_user
