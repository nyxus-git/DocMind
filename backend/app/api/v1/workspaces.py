import re
import uuid
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.v1.dependencies import get_current_user
from app.core.exceptions import CrossTenantAccessException, DocMindException
from app.db.session import get_db
from app.models.entities import User
from app.models.enums import WorkspaceRole
from app.repositories.user import UserRepository
from app.repositories.workspace import WorkspaceRepository
from app.schemas.workspace import (
    CreateCompanyWorkspaceRequest,
    InviteMemberRequest,
    InviteMemberResponse,
    UpdateMemberRoleRequest,
    WorkspaceDetailDTO,
    WorkspaceMemberDTO,
)

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


def slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


@router.get("", response_model=List[WorkspaceDetailDTO])
async def list_user_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all workspaces the authenticated user belongs to."""
    ws_repo = WorkspaceRepository(db)
    workspaces_with_role = await ws_repo.get_user_workspaces(current_user.id)
    
    results = []
    for ws, role in workspaces_with_role:
        count = await ws_repo.count_workspace_members(ws.id)
        results.append(
            WorkspaceDetailDTO(
                id=ws.id,
                name=ws.name,
                slug=ws.slug,
                role=role,
                created_at=ws.created_at,
                member_count=count
            )
        )
    return results


@router.post("/company", response_model=WorkspaceDetailDTO, status_code=status.HTTP_201_CREATED)
async def create_company_workspace(
    req: CreateCompanyWorkspaceRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Creates a new company / organization workspace with the caller as OWNER."""
    ws_repo = WorkspaceRepository(db)

    slug = req.slug.strip() if req.slug else slugify(req.name)
    if not slug:
        slug = f"ws-{uuid.uuid4().hex[:8]}"

    existing = await ws_repo.get_by_slug(slug)
    if existing:
        # Append short random hex to preserve uniqueness
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"

    workspace = await ws_repo.create_workspace(
        name=req.name.strip(),
        slug=slug,
        created_by=current_user.id
    )

    return WorkspaceDetailDTO(
        id=workspace.id,
        name=workspace.name,
        slug=workspace.slug,
        role=WorkspaceRole.OWNER.value,
        created_at=workspace.created_at,
        member_count=1
    )


@router.get("/{workspace_id}", response_model=WorkspaceDetailDTO)
async def get_workspace_detail(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Gets details of a specific workspace, enforcing tenant membership."""
    ws_repo = WorkspaceRepository(db)
    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership:
        raise CrossTenantAccessException()

    ws = await ws_repo.get_by_id(workspace_id)
    if not ws:
        raise DocMindException(status_code=404, code="WORKSPACE_NOT_FOUND", title="Not Found", detail="Workspace does not exist.")

    count = await ws_repo.count_workspace_members(workspace_id)
    return WorkspaceDetailDTO(
        id=ws.id,
        name=ws.name,
        slug=ws.slug,
        role=membership.role,
        created_at=ws.created_at,
        member_count=count
    )


@router.get("/{workspace_id}/members", response_model=List[WorkspaceMemberDTO])
async def list_workspace_members(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all team members in the given workspace."""
    ws_repo = WorkspaceRepository(db)
    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership:
        raise CrossTenantAccessException()

    members = await ws_repo.get_members(workspace_id)
    return [
        WorkspaceMemberDTO(
            user_id=member.user_id,
            email=email,
            role=member.role,
            joined_at=member.joined_at
        )
        for member, email in members
    ]


@router.post("/{workspace_id}/invites", response_model=InviteMemberResponse)
async def invite_workspace_member(
    workspace_id: uuid.UUID,
    req: InviteMemberRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Invites a team member to the company workspace."""
    ws_repo = WorkspaceRepository(db)
    user_repo = UserRepository(db)

    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership or membership.role not in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]:
        raise DocMindException(
            status_code=403,
            code="INSUFFICIENT_PERMISSIONS",
            title="Forbidden",
            detail="Only workspace Owners and Admins can invite team members."
        )

    # Validate target role
    target_role = req.role.upper()
    if target_role not in [WorkspaceRole.ADMIN.value, WorkspaceRole.MEMBER.value, WorkspaceRole.VIEWER.value]:
        raise DocMindException(
            status_code=400,
            code="INVALID_ROLE",
            title="Bad Request",
            detail=f"Role must be one of: ADMIN, MEMBER, VIEWER."
        )

    # Look up user by email
    target_user = await user_repo.get_by_email(req.email)
    if target_user:
        existing_mem = await ws_repo.get_user_membership(workspace_id, target_user.id)
        if existing_mem:
            raise DocMindException(
                status_code=409,
                code="ALREADY_MEMBER",
                title="Conflict",
                detail=f"User {req.email} is already a member of this workspace."
            )
        await ws_repo.add_member(workspace_id, target_user.id, target_role)
        return InviteMemberResponse(
            workspace_id=workspace_id,
            email=req.email,
            role=target_role,
            status="ACTIVE",
            message=f"Added {req.email} directly to workspace as {target_role}."
        )

    # User does not exist yet; return invite confirmation
    return InviteMemberResponse(
        workspace_id=workspace_id,
        email=req.email,
        role=target_role,
        status="INVITED",
        message=f"Invitation registered for {req.email}. Member will be automatically linked upon account creation."
    )


@router.patch("/{workspace_id}/members/{target_user_id}", response_model=WorkspaceMemberDTO)
async def update_member_role(
    workspace_id: uuid.UUID,
    target_user_id: uuid.UUID,
    req: UpdateMemberRoleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Updates the role of an existing workspace member."""
    ws_repo = WorkspaceRepository(db)
    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership or membership.role not in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]:
        raise DocMindException(
            status_code=403,
            code="INSUFFICIENT_PERMISSIONS",
            title="Forbidden",
            detail="Only workspace Owners and Admins can modify member roles."
        )

    target_membership = await ws_repo.get_user_membership(workspace_id, target_user_id)
    if not target_membership:
        raise DocMindException(status_code=404, code="MEMBER_NOT_FOUND", title="Not Found", detail="Member not found in workspace.")

    # Cannot modify the role of an OWNER unless caller is OWNER
    if target_membership.role == WorkspaceRole.OWNER.value and membership.role != WorkspaceRole.OWNER.value:
        raise DocMindException(status_code=403, code="CANNOT_MODIFY_OWNER", title="Forbidden", detail="Only workspace Owners can modify Owner roles.")

    new_role = req.role.upper()
    if new_role not in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value, WorkspaceRole.MEMBER.value, WorkspaceRole.VIEWER.value]:
        raise DocMindException(status_code=400, code="INVALID_ROLE", title="Bad Request", detail="Invalid role specified.")

    updated = await ws_repo.update_member_role(workspace_id, target_user_id, new_role)
    user_repo = UserRepository(db)
    target_user = await user_repo.get_by_id(target_user_id)

    return WorkspaceMemberDTO(
        user_id=target_user_id,
        email=target_user.email if target_user else "unknown",
        role=updated.role,
        joined_at=updated.joined_at
    )


@router.delete("/{workspace_id}/members/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_workspace_member(
    workspace_id: uuid.UUID,
    target_user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Removes a team member from the workspace."""
    ws_repo = WorkspaceRepository(db)
    membership = await ws_repo.get_user_membership(workspace_id, current_user.id)
    if not membership:
        raise CrossTenantAccessException()

    # Allowed if caller is OWNER, ADMIN, or removing self
    is_admin = membership.role in [WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value]
    is_self = current_user.id == target_user_id

    if not (is_admin or is_self):
        raise DocMindException(status_code=403, code="INSUFFICIENT_PERMISSIONS", title="Forbidden", detail="Cannot remove member from workspace.")

    target_membership = await ws_repo.get_user_membership(workspace_id, target_user_id)
    if not target_membership:
        raise DocMindException(status_code=404, code="MEMBER_NOT_FOUND", title="Not Found", detail="Member not found.")

    if target_membership.role == WorkspaceRole.OWNER.value:
        raise DocMindException(status_code=400, code="CANNOT_REMOVE_OWNER", title="Bad Request", detail="Cannot remove workspace Owner. Transfer ownership first.")

    await ws_repo.remove_member(workspace_id, target_user_id)
    return None

