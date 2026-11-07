import asyncio
import uuid
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from app.models.entities import Base, User, Workspace, WorkspaceMember
from app.models.enums import WorkspaceRole
from app.repositories.workspace import WorkspaceRepository


async def _run_test_create_workspace():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[
            User.__table__,
            Workspace.__table__,
            WorkspaceMember.__table__
        ])

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        user_id = uuid.uuid4()
        user = User(id=user_id, email="owner@acme.com", password_hash="hash")
        session.add(user)
        await session.commit()

        repo = WorkspaceRepository(session)
        ws = await repo.create_workspace("Acme Global", "acme-global", user_id)
        await session.commit()

        assert ws.id is not None
        assert ws.name == "Acme Global"
        assert ws.slug == "acme-global"

        membership = await repo.get_user_membership(ws.id, user_id)
        assert membership is not None
        assert membership.role == WorkspaceRole.OWNER.value


def test_create_workspace_sets_owner():
    asyncio.run(_run_test_create_workspace())


async def _run_test_add_and_update_member():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[
            User.__table__,
            Workspace.__table__,
            WorkspaceMember.__table__
        ])

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        owner_id = uuid.uuid4()
        member_id = uuid.uuid4()
        user1 = User(id=owner_id, email="owner@corp.com", password_hash="h1")
        user2 = User(id=member_id, email="analyst@corp.com", password_hash="h2")
        session.add_all([user1, user2])
        await session.commit()

        repo = WorkspaceRepository(session)
        ws = await repo.create_workspace("Corp Intelligence", "corp-intel", owner_id)
        await session.commit()

        # Add member
        await repo.add_member(ws.id, member_id, WorkspaceRole.MEMBER.value)
        await session.commit()

        count = await repo.count_workspace_members(ws.id)
        assert count == 2

        # Update role to ADMIN
        updated = await repo.update_member_role(ws.id, member_id, WorkspaceRole.ADMIN.value)
        await session.commit()
        assert updated is not None
        assert updated.role == WorkspaceRole.ADMIN.value

        # Remove member
        removed = await repo.remove_member(ws.id, member_id)
        await session.commit()
        assert removed is True

        count_after = await repo.count_workspace_members(ws.id)
        assert count_after == 1


def test_add_and_update_member_role():
    asyncio.run(_run_test_add_and_update_member())
