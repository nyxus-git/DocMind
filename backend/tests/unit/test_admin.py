import asyncio
import uuid
import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from app.api.v1.dependencies import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.entities import Base, User, Workspace, WorkspaceMember
from app.models.enums import UserStatus, WorkspaceRole, WorkspaceTier
from app.repositories.workspace import WorkspaceRepository


async def _run_test_admin_access_control():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(bind=engine, expire_on_commit=False)

    # 1. Create standard company owner (e.g., admin@infosys.com)
    regular_user = User(
        id=uuid.uuid4(),
        email="admin@infosys.com",
        password_hash="hash_regular",
        status=UserStatus.ACTIVE.value,
        is_superadmin=False,
    )
    # 2. Create platform super-admin (admin@docmind.com)
    super_admin = User(
        id=uuid.uuid4(),
        email="admin@docmind.com",
        password_hash="hash_admin",
        status=UserStatus.ACTIVE.value,
        is_superadmin=True,
    )

    async with async_session() as s:
        s.add_all([regular_user, super_admin])
        await s.commit()

        ws_repo = WorkspaceRepository(s)
        # Create Infosys workspace
        ws_infosys = await ws_repo.create_workspace("Infosys Ltd", "infosys", regular_user.id, WorkspaceTier.STARTER.value)
        # Create HQ workspace
        ws_hq = await ws_repo.create_workspace("DocMind Platform HQ", "docmind-hq-001", super_admin.id, WorkspaceTier.ENTERPRISE.value)
        await s.commit()
        infosys_id = ws_infosys.id
        hq_id = ws_hq.id

    current_test_user = regular_user

    async def override_get_db():
        async with async_session() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    async def override_user():
        return current_test_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            # A. Regular user (admin@infosys.com) MUST be rejected with 403 PLATFORM_ADMIN_REQUIRED
            res1 = await client.get("/api/v1/admin/workspaces")
            assert res1.status_code == 403
            assert res1.json().get("code") == "PLATFORM_ADMIN_REQUIRED"

            res2 = await client.get("/api/v1/admin/overview")
            assert res2.status_code == 403
            assert res2.json().get("code") == "PLATFORM_ADMIN_REQUIRED"

            res3 = await client.get("/api/v1/admin/users")
            assert res3.status_code == 403
            assert res3.json().get("code") == "PLATFORM_ADMIN_REQUIRED"

            # B. Switch to platform super-admin
            current_test_user = super_admin

            # 1. Super-admin can list all customer workspaces
            res_ws = await client.get("/api/v1/admin/workspaces")
            assert res_ws.status_code == 200
            ws_list = res_ws.json()
            assert len(ws_list) >= 2
            ws_names = [w["name"] for w in ws_list]
            assert "Infosys Ltd" in ws_names
            assert "DocMind Platform HQ" in ws_names

            # 2. Super-admin can list all registered users
            res_users = await client.get("/api/v1/admin/users")
            assert res_users.status_code == 200
            user_list = res_users.json()
            assert len(user_list) >= 2
            emails = [u["email"] for u in user_list]
            assert "admin@infosys.com" in emails
            assert "admin@docmind.com" in emails

            # 3. Super-admin can override tier of Infosys to ENTERPRISE
            res_tier = await client.patch(
                f"/api/v1/admin/workspaces/{infosys_id}/tier",
                json={"tier": "ENTERPRISE"}
            )
            assert res_tier.status_code == 200
            assert res_tier.json()["tier"] == "ENTERPRISE"

            # 4. Super-admin can suspend customer account
            res_suspend = await client.patch(
                f"/api/v1/admin/users/{regular_user.id}/status",
                json={"status": "SUSPENDED"}
            )
            assert res_suspend.status_code == 200
            assert res_suspend.json()["status"] == "SUSPENDED"

            # 5. Super-admin cannot suspend themselves
            res_self_suspend = await client.patch(
                f"/api/v1/admin/users/{super_admin.id}/status",
                json={"status": "SUSPENDED"}
            )
            assert res_self_suspend.status_code == 400
            assert res_self_suspend.json().get("code") == "CANNOT_SUSPEND_ADMIN"

            # 6. Super-admin cannot delete platform HQ
            res_del_hq = await client.delete(f"/api/v1/admin/workspaces/{hq_id}")
            assert res_del_hq.status_code == 400
            assert res_del_hq.json().get("code") == "CANNOT_DELETE_PLATFORM_HQ"

            # 7. Super-admin can delete customer workspace
            res_del_ws = await client.delete(f"/api/v1/admin/workspaces/{infosys_id}")
            assert res_del_ws.status_code == 204

            # Verify it's gone
            res_ws_after = await client.get("/api/v1/admin/workspaces")
            assert res_ws_after.status_code == 200
            remaining_names = [w["name"] for w in res_ws_after.json()]
            assert "Infosys Ltd" not in remaining_names

    finally:
        app.dependency_overrides.clear()


def test_admin_access_control():
    asyncio.run(_run_test_admin_access_control())

