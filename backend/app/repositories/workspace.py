import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import User, Workspace, WorkspaceInvitation, WorkspaceMember
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

    async def count_members_by_workspace(self, workspace_ids: Optional[List[uuid.UUID]] = None) -> Dict[uuid.UUID, int]:
        """Returns member counts keyed by workspace_id in one GROUP BY query."""
        if workspace_ids is not None and not workspace_ids:
            return {}
        query = select(WorkspaceMember.workspace_id, func.count(WorkspaceMember.user_id))
        if workspace_ids is not None:
            query = query.where(WorkspaceMember.workspace_id.in_(workspace_ids))
        result = await self.db.execute(query.group_by(WorkspaceMember.workspace_id))
        return {row[0]: int(row[1]) for row in result.all()}

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

    async def rename_workspace(self, workspace_id: uuid.UUID, name: str) -> Optional[Workspace]:
        ws = await self.get_by_id(workspace_id)
        if not ws:
            return None
        ws.name = name.strip()
        await self.db.flush()
        return ws

    async def transfer_ownership(
        self,
        workspace_id: uuid.UUID,
        current_owner_id: uuid.UUID,
        new_owner_id: uuid.UUID,
    ) -> Optional[WorkspaceMember]:
        cur = await self.get_user_membership(workspace_id, current_owner_id)
        target = await self.get_user_membership(workspace_id, new_owner_id)
        if not cur or not target or cur.role != WorkspaceRole.OWNER.value:
            return None
        cur.role = WorkspaceRole.ADMIN.value
        target.role = WorkspaceRole.OWNER.value
        await self.db.flush()
        return target

    async def create_invitation(
        self,
        workspace_id: uuid.UUID,
        email: str,
        role: str,
        invited_by: uuid.UUID,
        token_hash: str,
        expires_days: int = 7,
    ) -> WorkspaceInvitation:
        norm_email = email.strip().lower()
        # Revoke any older pending invites to the same email in this workspace
        existing_res = await self.db.execute(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.workspace_id == workspace_id,
                WorkspaceInvitation.email == norm_email,
                WorkspaceInvitation.status == "PENDING",
            )
        )
        for old_inv in existing_res.scalars().all():
            old_inv.status = "REVOKED"

        inv = WorkspaceInvitation(
            workspace_id=workspace_id,
            email=norm_email,
            role=role,
            invited_by=invited_by,
            token_hash=token_hash,
            status="PENDING",
            expires_at=datetime.now(timezone.utc) + timedelta(days=expires_days),
        )
        self.db.add(inv)
        await self.db.flush()
        return inv

    async def list_pending_invitations(self, workspace_id: uuid.UUID) -> List[WorkspaceInvitation]:
        result = await self.db.execute(
            select(WorkspaceInvitation)
            .where(
                WorkspaceInvitation.workspace_id == workspace_id,
                WorkspaceInvitation.status == "PENDING",
            )
            .order_by(WorkspaceInvitation.created_at.desc())
        )
        now = datetime.now(timezone.utc)
        valid: List[WorkspaceInvitation] = []
        for inv in result.scalars().all():
            exp = inv.expires_at if inv.expires_at.tzinfo else inv.expires_at.replace(tzinfo=timezone.utc)
            if exp > now:
                valid.append(inv)
        return valid

    async def revoke_invitation(self, workspace_id: uuid.UUID, invite_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.id == invite_id,
                WorkspaceInvitation.workspace_id == workspace_id,
                WorkspaceInvitation.status == "PENDING",
            )
        )
        inv = result.scalar_one_or_none()
        if not inv:
            return False
        inv.status = "REVOKED"
        await self.db.flush()
        return True

    async def accept_pending_invitations_for_user(self, user_id: uuid.UUID, email: str) -> List[uuid.UUID]:
        """Auto-links a user to any workspaces with active PENDING invitations matching their email."""
        norm_email = email.strip().lower()
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.email == norm_email,
                WorkspaceInvitation.status == "PENDING",
            )
        )
        joined_ws_ids: List[uuid.UUID] = []
        for inv in result.scalars().all():
            exp = inv.expires_at if inv.expires_at.tzinfo else inv.expires_at.replace(tzinfo=timezone.utc)
            if exp < now:
                inv.status = "EXPIRED"
                continue

            existing_mem = await self.get_user_membership(inv.workspace_id, user_id)
            if not existing_mem:
                await self.add_member(inv.workspace_id, user_id, inv.role)
            inv.status = "ACCEPTED"
            inv.accepted_at = now
            joined_ws_ids.append(inv.workspace_id)

        await self.db.flush()
        return joined_ws_ids
