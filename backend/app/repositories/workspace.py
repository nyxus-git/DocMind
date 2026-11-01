import uuid
from typing import List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import Workspace, WorkspaceMember
from app.models.enums import WorkspaceRole


class WorkspaceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_workspace(self, name: str, slug: str, created_by: uuid.UUID) -> Workspace:
        workspace = Workspace(
            name=name,
            slug=slug,
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
