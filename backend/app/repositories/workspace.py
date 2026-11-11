import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Set, Tuple
from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import (
    KnowledgeSpace,
    SpaceMember,
    User,
    Workspace,
    WorkspaceInvitation,
    WorkspaceJoinRequest,
    WorkspaceMember,
)
from app.models.enums import JoinPolicy, JoinRequestStatus, SpaceVisibility, WorkspaceRole, WorkspaceTier, WorkspaceType


class WorkspaceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_workspace(
        self,
        name: str,
        slug: str,
        created_by: uuid.UUID,
        tier: str = WorkspaceTier.STARTER.value,
        workspace_type: str = WorkspaceType.PERSONAL.value,
        allowed_domains: Optional[List[str]] = None,
        join_policy: str = JoinPolicy.INVITE_ONLY.value,
        default_join_role: str = WorkspaceRole.EMPLOYEE.value,
        starter_prompts: Optional[List[str]] = None,
    ) -> Workspace:
        workspace = Workspace(
            name=name,
            slug=slug,
            tier=tier,
            workspace_type=workspace_type,
            allowed_domains=allowed_domains or [],
            join_policy=join_policy,
            default_join_role=default_join_role,
            starter_prompts=starter_prompts or [],
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
        norm = (slug or "").strip().lower()
        if not norm:
            return None
        result = await self.db.execute(select(Workspace).where(func.lower(Workspace.slug) == norm))
        return result.scalar_one_or_none()

    async def get_company_by_slug(self, slug: str) -> Optional[Workspace]:
        norm = (slug or "").strip().lower()
        if not norm:
            return None
        result = await self.db.execute(
            select(Workspace).where(
                func.lower(Workspace.slug) == norm,
                Workspace.workspace_type == WorkspaceType.COMPANY.value,
            )
        )
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
        # Always surface company workspaces ahead of auto-created personal workspaces.
        company_priority = case((Workspace.workspace_type == WorkspaceType.COMPANY.value, 0), else_=1)
        result = await self.db.execute(
            select(Workspace, WorkspaceMember.role)
            .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
            .where(WorkspaceMember.user_id == user_id)
            .order_by(company_priority.asc(), Workspace.created_at.asc())
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

    async def has_pending_invitation(self, email: str, workspace_id: Optional[uuid.UUID] = None) -> bool:
        norm_email = email.strip().lower()
        now = datetime.now(timezone.utc)
        stmt = select(WorkspaceInvitation).where(
            WorkspaceInvitation.email == norm_email,
            WorkspaceInvitation.status == "PENDING",
        )
        if workspace_id is not None:
            stmt = stmt.where(WorkspaceInvitation.workspace_id == workspace_id)
        res = await self.db.execute(stmt)
        for inv in res.scalars().all():
            exp = inv.expires_at if inv.expires_at.tzinfo else inv.expires_at.replace(tzinfo=timezone.utc)
            if exp > now:
                return True
        return False

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

    async def find_company_by_domain(self, domain: str) -> Optional[Workspace]:
        norm = (domain or "").strip().lower().lstrip("@")
        if not norm:
            return None
        res = await self.db.execute(
            select(Workspace)
            .where(Workspace.workspace_type == WorkspaceType.COMPANY.value)
            .order_by(Workspace.created_at.asc())
        )
        for ws in res.scalars().all():
            domains = [str(d).strip().lower() for d in (ws.allowed_domains or [])]
            if norm in domains:
                return ws
        return None

    async def find_domain_conflicts(self, domains: List[str], exclude_ws_id: Optional[uuid.UUID] = None) -> List[str]:
        wanted = {d.strip().lower() for d in domains if d.strip()}
        if not wanted:
            return []
        res = await self.db.execute(select(Workspace).where(Workspace.workspace_type == WorkspaceType.COMPANY.value))
        conflicts: List[str] = []
        for ws in res.scalars().all():
            if exclude_ws_id and ws.id == exclude_ws_id:
                continue
            ws_domains = {str(d).strip().lower() for d in (ws.allowed_domains or [])}
            overlap = wanted & ws_domains
            for d in overlap:
                if d not in conflicts:
                    conflicts.append(d)
        return conflicts

    async def create_or_get_join_request(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        email: str,
        department_note: Optional[str] = None,
    ) -> WorkspaceJoinRequest:
        res = await self.db.execute(
            select(WorkspaceJoinRequest).where(
                WorkspaceJoinRequest.workspace_id == workspace_id,
                WorkspaceJoinRequest.user_id == user_id,
            )
        )
        req = res.scalar_one_or_none()
        if req:
            if req.status == JoinRequestStatus.REJECTED.value:
                req.status = JoinRequestStatus.PENDING.value
            if department_note:
                req.department_note = department_note
            await self.db.flush()
            return req

        req = WorkspaceJoinRequest(
            workspace_id=workspace_id,
            user_id=user_id,
            email=email.strip().lower(),
            department_note=department_note,
            status=JoinRequestStatus.PENDING.value,
        )
        self.db.add(req)
        await self.db.flush()
        return req

    async def get_pending_join_requests_for_user(self, user_id: uuid.UUID) -> List[Tuple[WorkspaceJoinRequest, Workspace]]:
        res = await self.db.execute(
            select(WorkspaceJoinRequest, Workspace)
            .join(Workspace, WorkspaceJoinRequest.workspace_id == Workspace.id)
            .where(
                WorkspaceJoinRequest.user_id == user_id,
                WorkspaceJoinRequest.status == JoinRequestStatus.PENDING.value,
            )
            .order_by(WorkspaceJoinRequest.created_at.desc())
        )
        return list(res.all())

    async def list_join_requests(
        self,
        workspace_id: uuid.UUID,
        status_filter: Optional[str] = None,
    ) -> List[WorkspaceJoinRequest]:
        query = select(WorkspaceJoinRequest).where(WorkspaceJoinRequest.workspace_id == workspace_id)
        if status_filter:
            query = query.where(WorkspaceJoinRequest.status == status_filter.upper())
        query = query.order_by(WorkspaceJoinRequest.created_at.desc())
        res = await self.db.execute(query)
        return list(res.scalars().all())

    async def get_join_request(self, workspace_id: uuid.UUID, request_id: uuid.UUID) -> Optional[WorkspaceJoinRequest]:
        res = await self.db.execute(
            select(WorkspaceJoinRequest).where(
                WorkspaceJoinRequest.id == request_id,
                WorkspaceJoinRequest.workspace_id == workspace_id,
            )
        )
        return res.scalar_one_or_none()

    async def list_spaces(self, workspace_id: uuid.UUID) -> List[Tuple[KnowledgeSpace, List[uuid.UUID]]]:
        spaces_res = await self.db.execute(
            select(KnowledgeSpace)
            .where(KnowledgeSpace.workspace_id == workspace_id)
            .order_by(KnowledgeSpace.created_at.asc())
        )
        spaces = list(spaces_res.scalars().all())
        if not spaces:
            return []

        space_ids = [s.id for s in spaces]
        mems_res = await self.db.execute(
            select(SpaceMember.space_id, SpaceMember.user_id).where(SpaceMember.space_id.in_(space_ids))
        )
        members_map: Dict[uuid.UUID, List[uuid.UUID]] = {sid: [] for sid in space_ids}
        for sid, uid in mems_res.all():
            members_map.setdefault(sid, []).append(uid)
        return [(s, members_map.get(s.id, [])) for s in spaces]

    async def get_space(self, workspace_id: uuid.UUID, space_id: uuid.UUID) -> Optional[KnowledgeSpace]:
        res = await self.db.execute(
            select(KnowledgeSpace).where(
                KnowledgeSpace.id == space_id,
                KnowledgeSpace.workspace_id == workspace_id,
            )
        )
        return res.scalar_one_or_none()

    async def set_space_members(self, space_id: uuid.UUID, user_ids: List[uuid.UUID]) -> None:
        await self.db.execute(delete(SpaceMember).where(SpaceMember.space_id == space_id))
        for uid in dict.fromkeys(user_ids):
            self.db.add(SpaceMember(space_id=space_id, user_id=uid))
        await self.db.flush()

    async def get_accessible_space_ids(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        role: str,
    ) -> Optional[Set[uuid.UUID]]:
        """Returns None for unrestricted OWNER/ADMIN access, or the exact set of permitted Space IDs."""
        if role in (WorkspaceRole.OWNER.value, WorkspaceRole.ADMIN.value):
            return None

        spaces = await self.list_spaces(workspace_id)
        allowed: Set[uuid.UUID] = set()
        for space, member_ids in spaces:
            if space.visibility == SpaceVisibility.ALL_MEMBERS.value:
                allowed.add(space.id)
            elif role in (space.allowed_roles or []):
                allowed.add(space.id)
            elif user_id in member_ids:
                allowed.add(space.id)
        return allowed
