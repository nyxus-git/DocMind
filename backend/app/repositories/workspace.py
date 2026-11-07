import uuid
from typing import List, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import User, Workspace, WorkspaceMember
from app.models.enums import WorkspaceRole, WorkspaceTier


class WorkspaceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_workspace(self, name: str, slug: str, created_by: uuid.UUID, tier: str = WorkspaceTier.STARTER.value) -> Workspace:
        workspace = Workspace(
            name=name,
            slug=slug,
            tier=tier,
            created_by=created_by
        )
        self.db.add(workspace)
        await self.db.flush()

        member = WorkspaceMember(
            workspace_id=workspace.id,
            user_id=created_by,
            role=WorkspaceRole.OWNER.value
        )
        self.db.add(member)
        await self.db.flush()
        return workspace

    async def get_by_id(self, workspace_id: uuid.UUID) -> Optional[Workspace]:
        result = await self.db.execute(select(Workspace).where(Workspace.id == workspace_id))
        return result.scalar_one_or_none()

    async def get_by_slug(self, slug: str) -> Optional[Workspace]:
        result = await self.db.execute(select(Workspace).where(Workspace.slug == slug))
        return result.scalar_one_or_none()

    async def get_user_membership(self, workspace_id: uuid.UUID, user_id: uuid.UUID) -> Optional[WorkspaceMember]:
        result = await self.db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id
            )
        )
        return result.scalar_one_or_none()

    async def get_user_workspaces(self, user_id: uuid.UUID) -> List[Tuple[Workspace, str]]:
        result = await self.db.execute(
            select(Workspace, WorkspaceMember.role)
            .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
            .where(WorkspaceMember.user_id == user_id)
            .order_by(Workspace.created_at.asc())
        )
        return list(result.all())

    async def count_workspace_members(self, workspace_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(WorkspaceMember.user_id)).where(WorkspaceMember.workspace_id == workspace_id)
        )
        return int(result.scalar_one_or_none() or 0)

    async def get_members(self, workspace_id: uuid.UUID) -> List[Tuple[WorkspaceMember, str]]:
        """Returns list of (WorkspaceMember, user_email)."""
        result = await self.db.execute(
            select(WorkspaceMember, User.email)
            .join(User, WorkspaceMember.user_id == User.id)
            .where(WorkspaceMember.workspace_id == workspace_id)
            .order_by(WorkspaceMember.joined_at.asc())
        )
        return list(result.all())

    async def add_member(self, workspace_id: uuid.UUID, user_id: uuid.UUID, role: str) -> WorkspaceMember:
        member = WorkspaceMember(
            workspace_id=workspace_id,
            user_id=user_id,
            role=role
        )
        self.db.add(member)
        await self.db.flush()
        return member

    async def update_member_role(self, workspace_id: uuid.UUID, user_id: uuid.UUID, role: str) -> Optional[WorkspaceMember]:
        member = await self.get_user_membership(workspace_id, user_id)
        if not member:
            return None
        member.role = role
        await self.db.flush()
        return member

    async def remove_member(self, workspace_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        member = await self.get_user_membership(workspace_id, user_id)
        if not member:
            return False
        await self.db.delete(member)
        await self.db.flush()
        return True

    async def update_tier(self, workspace_id: uuid.UUID, tier: str) -> Optional[Workspace]:
        ws = await self.get_by_id(workspace_id)
        if not ws:
            return None
        ws.tier = tier
        await self.db.flush()
        return ws
