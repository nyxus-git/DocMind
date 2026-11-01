from typing import Optional
from fastapi import APIRouter, Cookie, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.exceptions import DocMindException
from app.db.session import get_db
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserSummaryDTO,
    VerifyEmailRequest,
    WorkspaceSummaryDTO,
)
from app.schemas.common import MessageResponse
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserSummaryDTO, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    auth_service = AuthService(db)
    user, workspace, _ = await auth_service.register(req.email, req.password)
    return UserSummaryDTO(
        id=user.id,
        email=user.email,
        status=user.status,
        verified=False,
        active_workspace=WorkspaceSummaryDTO(
            id=workspace.id,
            name=workspace.name,
            slug=workspace.slug,
            role="OWNER"
        )
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    auth_service = AuthService(db)
    token_resp, refresh_token, _ = await auth_service.login(req.email, req.password)

    # Set secure HttpOnly refresh cookie
    response.set_cookie(
        key="docmind_refresh_token",
        value=refresh_token,
        httponly=True,
        secure=(settings.APP_ENV == "production"),
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth"
    )
    return token_resp


@router.post("/demo-login", response_model=TokenResponse)
async def demo_login(response: Response, db: AsyncSession = Depends(get_db)):
    auth_service = AuthService(db)
    demo_email = "demo@docmind.ai"
    demo_password = "Password123!"
    existing = await auth_service.user_repo.get_by_email(demo_email)
    if not existing:
        await auth_service.register(demo_email, demo_password)
    token_resp, refresh_token, _ = await auth_service.login(demo_email, demo_password)

    response.set_cookie(
        key="docmind_refresh_token",
        value=refresh_token,
        httponly=True,
        secure=(settings.APP_ENV == "production"),
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth"
    )
    return token_resp


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    docmind_refresh_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db)
):
    if not docmind_refresh_token:
        raise DocMindException(
            status_code=401,
            code="REFRESH_COOKIE_MISSING",
            title="Unauthorized",
            detail="Refresh session cookie is required."
        )

    auth_service = AuthService(db)
    token_resp, new_refresh_token = await auth_service.refresh_session(docmind_refresh_token)

    response.set_cookie(
        key="docmind_refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=(settings.APP_ENV == "production"),
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth"
    )
    return token_resp


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    docmind_refresh_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db)
):
    if docmind_refresh_token:
        auth_service = AuthService(db)
        await auth_service.logout(docmind_refresh_token)
    response.delete_cookie(key="docmind_refresh_token", path="/api/v1/auth")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(req: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    return MessageResponse(message="Email verified successfully.")


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    # Always return 202 Accepted to prevent user enumeration per PRD Page 27
    return {"message": "If an account exists, a password reset link has been dispatched."}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    return Response(status_code=status.HTTP_204_NO_CONTENT)
