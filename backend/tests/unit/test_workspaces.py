import asyncio
import uuid
import httpx
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.api.v1.dependencies import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.entities import Base, User, Workspace, WorkspaceMember
from app.models.enums import WorkspaceRole
from app.repositories.workspace import WorkspaceRepository


async def _run_test_create_workspace():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
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
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
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


async def _run_test_api_workspace_lifecycle():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[
            User.__table__,
            Workspace.__table__,
            WorkspaceMember.__table__
        ])
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    test_user = User(id=uuid.uuid4(), email="director@acme.ai", password_hash="hash")
    async with async_session() as s:
        s.add(test_user)
        await s.commit()

    async def override_get_db():
        async with async_session() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    async def override_user():
        return test_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            # 1. Create company workspace
            create_res = await client.post(
                "/api/v1/workspaces/company",
                json={"name": "Meridian Global", "slug": "meridian-global"}
            )
            assert create_res.status_code == 201
            ws_data = create_res.json()
            assert ws_data["name"] == "Meridian Global"
            assert ws_data["slug"] == "meridian-global"
            assert ws_data["role"] == "OWNER"
            ws_id = ws_data["id"]

            # 2. List user workspaces
            list_res = await client.get("/api/v1/workspaces")
            assert list_res.status_code == 200
            workspaces = list_res.json()
            assert len(workspaces) == 1
            assert workspaces[0]["id"] == ws_id

            # 3. List members
            members_res = await client.get(f"/api/v1/workspaces/{ws_id}/members")
            assert members_res.status_code == 200
            members = members_res.json()
            assert len(members) == 1
            assert members[0]["email"] == "director@acme.ai"
            assert members[0]["role"] == "OWNER"

            # 4. Invite new member
            invite_res = await client.post(
                f"/api/v1/workspaces/{ws_id}/invites",
                json={"email": "new.analyst@acme.ai", "role": "MEMBER"}
            )
            assert invite_res.status_code == 200
            assert invite_res.json()["status"] == "INVITED"

            # 5. Cannot remove sole owner
            del_res = await client.delete(f"/api/v1/workspaces/{ws_id}/members/{test_user.id}")
            assert del_res.status_code == 400
            assert "CANNOT_REMOVE_OWNER" in del_res.json().get("code", "")
    finally:
        app.dependency_overrides.clear()


def test_api_workspace_lifecycle():
    asyncio.run(_run_test_api_workspace_lifecycle())
