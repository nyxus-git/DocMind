import hashlib
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from app.adapters.email.base import EmailProvider
from app.adapters.email.smtp import get_email_provider
from app.core.config import settings
from app.core.domains import extract_email_domain, is_corporate_domain
from app.core.exceptions import DocMindException
from app.core.security import (
    create_access_token,
    create_email_verification_token,
    create_password_reset_token,
    decode_password_reset_token,
    generate_secure_token,
    hash_password,
    hash_token,
    verify_email_verification_token,
    verify_password,
)
from app.models.entities import RefreshSession, User, Workspace
from app.models.enums import JoinPolicy, UserStatus, WorkspaceRole, WorkspaceTier, WorkspaceType
from app.repositories.user import UserRepository
from app.repositories.workspace import WorkspaceRepository
from app.schemas.auth import (
    CompanyDomainLookupDTO,
    PendingJoinRequestDTO,
    TokenResponse,
    UserSummaryDTO,
    WorkspaceSummaryDTO,
)


class AuthService:
    def __init__(self, db: AsyncSession, email_provider: Optional[EmailProvider] = None):
        self.db = db
        self.user_repo = UserRepository(db)
        self.workspace_repo = WorkspaceRepository(db)
        self.email_provider = email_provider or get_email_provider()

    async def lookup_company_by_email(self, email: str) -> CompanyDomainLookupDTO:
        domain = extract_email_domain(email)
        if not is_corporate_domain(domain):
            return CompanyDomainLookupDTO(matched=False, domain=domain)
        ws = await self.workspace_repo.find_company_by_domain(domain or "")
        if not ws:
            return CompanyDomainLookupDTO(matched=False, domain=domain)
        return CompanyDomainLookupDTO(
            matched=True,
            workspace_id=ws.id,
            company_name=ws.name,
            slug=ws.slug,
            domain=domain,
            join_policy=ws.join_policy,
        )

    async def _apply_domain_join_if_eligible(
        self,
        user: User,
        department_note: Optional[str] = None,
    ) -> Tuple[Optional[Workspace], Optional[PendingJoinRequestDTO]]:
        """Routes corporate-domain users into auto-join membership or an admin-approval request."""
        domain = extract_email_domain(user.email)
        if not is_corporate_domain(domain):
            return None, None
        ws = await self.workspace_repo.find_company_by_domain(domain or "")
        if not ws:
            return None, None

        existing_mem = await self.workspace_repo.get_user_membership(ws.id, user.id)
        if existing_mem:
            return ws, None

        if ws.join_policy == JoinPolicy.DOMAIN_AUTO_JOIN.value:
            if not settings.REQUIRE_EMAIL_VERIFICATION or user.verified_at:
                role = ws.default_join_role or WorkspaceRole.EMPLOYEE.value
                await self.workspace_repo.add_member(ws.id, user.id, role)
                return ws, None
            return None, None

        if ws.join_policy == JoinPolicy.DOMAIN_APPROVAL.value:
            req = await self.workspace_repo.create_or_get_join_request(
                workspace_id=ws.id,
                user_id=user.id,
                email=user.email,
                department_note=department_note,
            )
            return None, PendingJoinRequestDTO(
                workspace_id=ws.id,
                company_name=ws.name,
                status=req.status,
                created_at=req.created_at,
            )

        return None, None

    async def register(
        self,
        email: str,
        password: str,
        account_type: str = "personal",
        company_name: Optional[str] = None,
        company_slug: Optional[str] = None,
        claim_domain: bool = False,
        department_note: Optional[str] = None,
    ) -> Tuple[User, Optional[Workspace], str]:
        existing = await self.user_repo.get_by_email(email)
        if existing:
            raise DocMindException(
                status_code=409,
                code="EMAIL_ALREADY_EXISTS",
                title="Account Exists",
                detail="An account with this email address already exists."
            )

        mode = (account_type or "personal").strip().lower()
        domain = extract_email_domain(email)

        if mode == "employee":
            if not is_corporate_domain(domain):
                raise DocMindException(
                    status_code=400,
                    code="CORPORATE_EMAIL_REQUIRED",
                    title="Company Email Required",
                    detail="Please use your company email address (personal webmail domains are not allowed for employee sign-in).",
                )
            matched_ws = await self.workspace_repo.find_company_by_domain(domain or "")
            if matched_ws and matched_ws.join_policy == JoinPolicy.INVITE_ONLY.value:
                # Permit signup only if a pending invitation exists for this email
                pass

        password_hash = hash_password(password)
        user = await self.user_repo.create_user(email, password_hash)

        active_workspace: Optional[Workspace] = None

        # 1. Explicit company signup -> create COMPANY workspace directly (no stray Personal Workspace)
        if mode == "company" and company_name and company_name.strip():
            raw_slug = company_slug.strip().lower() if company_slug else re.sub(r"[^a-z0-9]+", "-", company_name.lower().strip()).strip("-")
            slug = raw_slug or f"company-{user.id.hex[:6]}"
            if await self.workspace_repo.get_by_slug(slug):
                slug = f"{slug}-{uuid.uuid4().hex[:4]}"

            allowed_domains = []
            join_policy = JoinPolicy.INVITE_ONLY.value
            if claim_domain and is_corporate_domain(domain):
                conflicts = await self.workspace_repo.find_domain_conflicts([domain or ""])
                if not conflicts and domain:
                    allowed_domains = [domain]
                    join_policy = JoinPolicy.DOMAIN_APPROVAL.value

            active_workspace = await self.workspace_repo.create_workspace(
                name=company_name.strip(),
                slug=slug,
                created_by=user.id,
                tier=WorkspaceTier.PRO.value,
                workspace_type=WorkspaceType.COMPANY.value,
                allowed_domains=allowed_domains,
                join_policy=join_policy,
                default_join_role=WorkspaceRole.EMPLOYEE.value,
            )

        # 2. Accept any pending workspace invitations matching this email
        joined_ids = []
        try:
            joined_ids = await self.workspace_repo.accept_pending_invitations_for_user(user.id, user.email)
        except Exception:
            pass
        if not active_workspace and joined_ids:
            active_workspace = await self.workspace_repo.get_by_id(joined_ids[0])

        # 3. Domain auto-join or approval request for corporate email users
        pending_req = None
        if not active_workspace:
            domain_ws, pending_req = await self._apply_domain_join_if_eligible(user, department_note=department_note)
            if domain_ws:
                active_workspace = domain_ws

        if mode == "employee" and not active_workspace and not pending_req:
            matched_ws = await self.workspace_repo.find_company_by_domain(domain or "")
            if matched_ws and matched_ws.join_policy == JoinPolicy.INVITE_ONLY.value:
                raise DocMindException(
                    status_code=403,
                    code="INVITE_REQUIRED",
                    title="Invitation Required",
                    detail=f"{matched_ws.name} requires an invitation from a Company Admin before joining.",
                )
            if not matched_ws:
                raise DocMindException(
                    status_code=404,
                    code="COMPANY_DOMAIN_NOT_FOUND",
                    title="Company Not Found",
                    detail=f"No company workspace has registered '@{domain}' yet. Ask your IT admin to register your company first.",
                )

        # 4. Individual signup with no company association -> create Personal Workspace
        if not active_workspace and not pending_req and mode != "employee":
            active_workspace = await self.workspace_repo.create_workspace(
                name="Personal Workspace",
                slug=f"ws-{user.id.hex[:8]}",
                created_by=user.id,
                tier=WorkspaceTier.STARTER.value,
                workspace_type=WorkspaceType.PERSONAL.value,
            )

        verification_token = create_email_verification_token(str(user.id))
        verification_link = f"{settings.PUBLIC_APP_URL}/auth?token={verification_token}&action=verify"
        try:
            await self.email_provider.send_verification_email(user.email, verification_link)
        except Exception:
            pass

        return user, active_workspace, verification_token

    async def verify_email(self, token: str) -> User:
        user_id_str = verify_email_verification_token(token)
        if not user_id_str:
            raise DocMindException(
                status_code=400,
                code="INVALID_OR_EXPIRED_TOKEN",
                title="Invalid Token",
                detail="Verification link is invalid or has expired."
            )

        try:
            user_uuid = uuid.UUID(user_id_str)
        except ValueError:
            raise DocMindException(
                status_code=400,
                code="INVALID_TOKEN_PAYLOAD",
                title="Invalid Token",
                detail="Malformed token user identifier."
            )

        user = await self.user_repo.mark_verified(user_uuid)
        if not user:
            raise DocMindException(
                status_code=404,
                code="USER_NOT_FOUND",
                title="User Not Found",
                detail="No account found associated with this token."
            )
        try:
            await self._apply_domain_join_if_eligible(user)
        except Exception:
            pass
        return user

    async def forgot_password(self, email: str) -> None:
        user = await self.user_repo.get_by_email(email)
        if not user:
            # Prevent user enumeration per PRD
            return

        token = create_password_reset_token(str(user.id), user.password_hash)
        reset_link = f"{settings.PUBLIC_APP_URL}/auth?token={token}&action=reset"
        try:
            await self.email_provider.send_password_reset_email(user.email, reset_link)
        except Exception:
            pass

    async def reset_password(self, token: str, new_password: str) -> None:
        payload = decode_password_reset_token(token)
        if not payload:
            raise DocMindException(
                status_code=400,
                code="INVALID_OR_EXPIRED_TOKEN",
                title="Invalid Reset Token",
                detail="Password reset token is invalid or has expired."
            )

        user_id_str = payload.get("sub")
        pwhash_prefix = payload.get("pwhash")

        try:
            user_uuid = uuid.UUID(str(user_id_str))
        except (ValueError, TypeError):
            raise DocMindException(
                status_code=400,
                code="INVALID_TOKEN_PAYLOAD",
                title="Invalid Reset Token",
                detail="Malformed reset token payload."
            )

        user = await self.user_repo.get_by_id(user_uuid)
        if not user:
            raise DocMindException(
                status_code=404,
                code="USER_NOT_FOUND",
                title="User Not Found",
                detail="Account associated with this token was not found."
            )

        current_fingerprint = hashlib.sha256(user.password_hash.encode("utf-8")).hexdigest()[:24]
        if current_fingerprint != pwhash_prefix:
            raise DocMindException(
                status_code=400,
                code="TOKEN_ALREADY_USED",
                title="Reset Link Invalidated",
                detail="This password reset link has already been used or invalidated. Please request a new link."
            )

        new_password_hash = hash_password(new_password)
        await self.user_repo.update_password(user.id, new_password_hash)
        await self.user_repo.revoke_all_user_sessions(user.id)

    async def resend_verification(self, email: str) -> None:
        user = await self.user_repo.get_by_email(email)
        if not user or user.verified_at or user.status in (UserStatus.SUSPENDED.value, UserStatus.DELETED.value):
            return
        token = create_email_verification_token(str(user.id))
        link = f"{settings.PUBLIC_APP_URL}/auth?token={token}&action=verify"
        try:
            await self.email_provider.send_verification_email(user.email, link)
        except Exception:
            pass

    async def login(self, email: str, password: str) -> Tuple[TokenResponse, str, UserSummaryDTO]:
        user = await self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise DocMindException(
                status_code=401,
                code="INVALID_CREDENTIALS",
                title="Authentication Failed",
                detail="Incorrect email or password."
            )

        if user.status == UserStatus.DELETED.value:
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

        if settings.REQUIRE_EMAIL_VERIFICATION and not user.verified_at and not user.is_superadmin:
            raise DocMindException(
                status_code=403,
                code="EMAIL_VERIFICATION_REQUIRED",
                title="Verification Required",
                detail="Please verify your email address before signing in. Check your inbox or request a new link."
            )

        try:
            await self.workspace_repo.accept_pending_invitations_for_user(user.id, user.email)
        except Exception:
            pass

        workspaces = await self.workspace_repo.get_user_workspaces(user.id)
        if not workspaces:
            await self._apply_domain_join_if_eligible(user)
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
                role=active_role or WorkspaceRole.OWNER.value,
                workspace_type=active_ws.workspace_type,
            )

        pending_dto = None
        if not active_ws:
            pending_reqs = await self.workspace_repo.get_pending_join_requests_for_user(user.id)
            if pending_reqs:
                req_row, req_ws = pending_reqs[0]
                pending_dto = PendingJoinRequestDTO(
                    workspace_id=req_ws.id,
                    company_name=req_ws.name,
                    status=req_row.status,
                    created_at=req_row.created_at,
                )

        user_dto = UserSummaryDTO(
            id=user.id,
            email=user.email,
            status=user.status,
            verified=(user.verified_at is not None),
            is_superadmin=user.is_superadmin,
            active_workspace=ws_dto,
            pending_join_request=pending_dto,
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
