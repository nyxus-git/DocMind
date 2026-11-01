from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.v1.dependencies import WorkspaceContext, get_current_user, get_current_workspace
from app.core.exceptions import DocMindException
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.entities import User
from app.models.enums import JobType, UserStatus
from app.repositories.job import JobRepository
from app.repositories.user import UserRepository
from app.schemas.auth import (
    ChangePasswordRequest,
    UpdateProfileRequest,
    UserProfileDTO,
    WorkspaceSummaryDTO,
)
from app.schemas.common import MessageResponse

router = APIRouter(tags=["Users"])


@router.get("/me", response_model=UserProfileDTO)
async def get_my_profile(
    ctx: WorkspaceContext = Depends(get_current_workspace)
):
    return UserProfileDTO(
        id=ctx.user.id,
        email=ctx.user.email,
        status=ctx.user.status,
        verified=(ctx.user.verified_at is not None),
        created_at=ctx.user.created_at,
        active_workspace=WorkspaceSummaryDTO(
            id=ctx.workspace.id,
            name=ctx.workspace.name,
            slug=ctx.workspace.slug,
            role=ctx.role
        )
    )


@router.patch("/me", response_model=UserProfileDTO)
async def update_my_profile(
    req: UpdateProfileRequest,
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    user_repo = UserRepository(db)
    if req.email:
        ctx.user.email = req.email.strip().lower()
        await db.flush()

    return UserProfileDTO(
        id=ctx.user.id,
        email=ctx.user.email,
        status=ctx.user.status,
        verified=(ctx.user.verified_at is not None),
        created_at=ctx.user.created_at,
        active_workspace=WorkspaceSummaryDTO(
            id=ctx.workspace.id,
            name=ctx.workspace.name,
            slug=ctx.workspace.slug,
            role=ctx.role
        )
    )


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not verify_password(req.current_password, current_user.password_hash):
        raise DocMindException(status_code=400, code="INVALID_CURRENT_PASSWORD", title="Failed", detail="Current password incorrect.")

    user_repo = UserRepository(db)
    new_hash = hash_password(req.new_password)
    await user_repo.update_password(current_user.id, new_hash)
    await user_repo.revoke_all_user_sessions(current_user.id)
    return MessageResponse(message="Password changed successfully. Please log in again with your new credentials.")


@router.post("/delete-account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    ctx: WorkspaceContext = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db)
):
    ctx.user.status = UserStatus.DELETED.value
    user_repo = UserRepository(db)
    job_repo = JobRepository(db)
    
    await user_repo.revoke_all_user_sessions(ctx.user.id)
    await job_repo.enqueue_job(
        workspace_id=ctx.workspace.id,
        job_type=JobType.DELETE_ACCOUNT.value,
        payload={"user_id": str(ctx.user.id)}
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
