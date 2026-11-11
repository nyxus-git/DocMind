import asyncio
import uuid
import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from app.core.domains import extract_email_domain, is_corporate_domain, normalize_corporate_domains
from app.db.session import get_db
from app.main import app
from app.models.entities import Base, Document, DocumentChunk
from app.models.enums import DocumentStatus, WorkspaceRole, WorkspaceType
from app.repositories.workspace import WorkspaceRepository


def test_corporate_domain_validation():
    assert extract_email_domain("Rahul@Infosys.COM") == "infosys.com"
    assert is_corporate_domain("infosys.com") is True
    assert is_corporate_domain("gmail.com") is False
    assert is_corporate_domain("yahoo.co.in") is False

    assert normalize_corporate_domains(["@Infosys.com", "infosys.com", "corp.acme.io"]) == [
        "infosys.com",
        "corp.acme.io",
    ]
    with pytest.raises(ValueError):
        normalize_corporate_domains(["gmail.com"])


async def _run_test_company_and_employee_enterprise_flow():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(bind=engine, expire_on_commit=False)

    async def override_get_db():
        async with async_session() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db

    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            # 1. Company admin registers Infosys directly -> NO stray Personal Workspace created
            reg_admin = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": "admin@infosys.com",
                    "password": "StrongPassword123!",
                    "account_type": "company",
                    "company_name": "Infosys",
                    "claim_domain": True,
                },
            )
            assert reg_admin.status_code == 201
            admin_data = reg_admin.json()
            assert admin_data["active_workspace"]["name"] == "Infosys"
            assert admin_data["active_workspace"]["workspace_type"] == WorkspaceType.COMPANY.value
            ws_id = uuid.UUID(admin_data["active_workspace"]["id"])

            login_admin = await client.post(
                "/api/v1/auth/login",
                json={"email": "admin@infosys.com", "password": "StrongPassword123!"},
            )
            assert login_admin.status_code == 200
            admin_tok = login_admin.json()["access_token"]
            admin_headers = {"Authorization": f"Bearer {admin_tok}", "X-Workspace-ID": str(ws_id)}

            # Verify only 1 workspace exists (not Personal Workspace)
            ws_list = await client.get("/api/v1/workspaces", headers={"Authorization": f"Bearer {admin_tok}"})
            assert ws_list.status_code == 200
            assert len(ws_list.json()) == 1
            assert ws_list.json()[0]["name"] == "Infosys"

            # 2. Even if admin also owns an older Personal Workspace, COMPANY workspace comes first
            async with async_session() as s:
                personal_ws = await WorkspaceRepository(s).create_workspace(
                    name="Personal Workspace",
                    slug="ws-personal-test",
                    created_by=uuid.UUID(admin_data["id"]),
                    workspace_type=WorkspaceType.PERSONAL.value,
                )
                await s.commit()
            ws_list_sorted = await client.get("/api/v1/workspaces", headers={"Authorization": f"Bearer {admin_tok}"})
            assert ws_list_sorted.json()[0]["name"] == "Infosys"
            assert ws_list_sorted.json()[1]["id"] == str(personal_ws.id)

            # 3. Domain lookup detects Infosys for employee email
            lookup = await client.get("/api/v1/auth/company-lookup", params={"email": "rahul@infosys.com"})
            assert lookup.status_code == 200
            assert lookup.json()["matched"] is True
            assert lookup.json()["company_name"] == "Infosys"
            assert lookup.json()["join_policy"] == "DOMAIN_APPROVAL"

            # 4. Employee signs up with @infosys.com -> Pending Approval (NO Personal Workspace)
            reg_emp = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": "rahul@infosys.com",
                    "password": "EmpPassword123!",
                    "account_type": "employee",
                    "department_note": "Engineering",
                },
            )
            assert reg_emp.status_code == 201
            assert reg_emp.json()["active_workspace"] is None

            login_emp = await client.post(
                "/api/v1/auth/login",
                json={"email": "rahul@infosys.com", "password": "EmpPassword123!"},
            )
            assert login_emp.status_code == 200
            emp_tok = login_emp.json()["access_token"]

            me_pending = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {emp_tok}"})
            assert me_pending.status_code == 200
            assert me_pending.json()["pending_join_request"]["company_name"] == "Infosys"

            portal_pending = await client.get("/api/v1/company/portal-info", headers={"Authorization": f"Bearer {emp_tok}"})
            assert portal_pending.status_code == 200
            assert portal_pending.json()["role"] == "PENDING"
            assert portal_pending.json()["pending_company_name"] == "Infosys"

            # 5. Company Admin configures starter prompts, restricted HR Space, and approves rahul as EMPLOYEE
            upd_settings = await client.patch(
                "/api/v1/company/settings",
                headers=admin_headers,
                json={"starter_prompts": ["What is our leave policy?"]},
            )
            assert upd_settings.status_code == 200
            assert upd_settings.json()["starter_prompts"] == ["What is our leave policy?"]

            reqs = await client.get("/api/v1/company/join-requests", headers=admin_headers)
            assert reqs.status_code == 200
            assert len(reqs.json()) == 1
            req_id = reqs.json()[0]["id"]

            decision = await client.post(
                f"/api/v1/company/join-requests/{req_id}/decision",
                headers=admin_headers,
                json={"decision": "APPROVE", "role": WorkspaceRole.EMPLOYEE.value},
            )
            assert decision.status_code == 200
            assert decision.json()["status"] == "APPROVED"

            hr_space_res = await client.post(
                "/api/v1/company/spaces",
                headers=admin_headers,
                json={
                    "name": "HR Confidential",
                    "description": "Restricted HR docs",
                    "visibility": "RESTRICTED",
                    "allowed_roles": ["OWNER", "ADMIN"],
                },
            )
            assert hr_space_res.status_code == 201
            hr_space_id = uuid.UUID(hr_space_res.json()["id"])

            # Seed one public handbook doc and one HR Confidential doc
            pub_doc_id = uuid.uuid4()
            hr_doc_id = uuid.uuid4()
            async with async_session() as s:
                s.add_all([
                    Document(
                        id=pub_doc_id,
                        workspace_id=ws_id,
                        uploaded_by=uuid.UUID(admin_data["id"]),
                        filename="Employee_Handbook.pdf",
                        mime_type="application/pdf",
                        size_bytes=2000,
                        checksum_sha256="a" * 64,
                        object_key=f"raw/{ws_id}/{pub_doc_id}.bin",
                        status=DocumentStatus.READY.value,
                        space_id=None,
                    ),
                    DocumentChunk(
                        workspace_id=ws_id,
                        document_id=pub_doc_id,
                        chunk_index=0,
                        content="Employees receive 24 days of annual paid leave per year.",
                        page_start=1,
                        page_end=1,
                    ),
                    Document(
                        id=hr_doc_id,
                        workspace_id=ws_id,
                        uploaded_by=uuid.UUID(admin_data["id"]),
                        filename="Executive_Compensation.pdf",
                        mime_type="application/pdf",
                        size_bytes=2000,
                        checksum_sha256="b" * 64,
                        object_key=f"raw/{ws_id}/{hr_doc_id}.bin",
                        status=DocumentStatus.READY.value,
                        space_id=hr_space_id,
                    ),
                    DocumentChunk(
                        workspace_id=ws_id,
                        document_id=hr_doc_id,
                        chunk_index=0,
                        content="Confidential executive bonus targets are 40 percent.",
                        page_start=1,
                        page_end=1,
                    ),
                ])
                await s.commit()

            # 6. Approved EMPLOYEE sees Handbook, CANNOT see HR Confidential, CANNOT upload, CANNOT manage company
            emp_headers = {"Authorization": f"Bearer {emp_tok}", "X-Workspace-ID": str(ws_id)}
            emp_portal = await client.get("/api/v1/company/portal-info", headers=emp_headers)
            assert emp_portal.status_code == 200
            assert emp_portal.json()["role"] == WorkspaceRole.EMPLOYEE.value
            assert emp_portal.json()["spaces"] == []

            emp_docs = await client.get("/api/v1/documents", headers=emp_headers)
            assert emp_docs.status_code == 200
            assert [d["filename"] for d in emp_docs.json()] == ["Employee_Handbook.pdf"]

            emp_upload = await client.post(
                "/api/v1/documents/upload-intents",
                headers=emp_headers,
                json={
                    "filename": "unauthorized.pdf",
                    "declared_mime": "application/pdf",
                    "size_bytes": 1000,
                    "checksum_sha256": "c" * 64,
                },
            )
            assert emp_upload.status_code == 403

            emp_company_admin = await client.get("/api/v1/company/overview", headers=emp_headers)
            assert emp_company_admin.status_code == 403

            # 7. EMPLOYEE CAN chat, create private conversation, and submit negative feedback -> visible in Knowledge Gaps!
            conv_res = await client.post("/api/v1/conversations", headers=emp_headers, json={"title": "Leave Policy"})
            assert conv_res.status_code == 201
            conv_id = conv_res.json()["id"]

            msg_res = await client.post(
                f"/api/v1/conversations/{conv_id}/messages",
                headers=emp_headers,
                json={"content": "What is our leave policy?"},
            )
            assert msg_res.status_code == 200
            msg_id = msg_res.json()["message_id"]

            fb_res = await client.post(
                f"/api/v1/conversations/{conv_id}/messages/{msg_id}/feedback",
                headers=emp_headers,
                json={"rating": -1, "comment": "Need carryover details"},
            )
            assert fb_res.status_code == 200
            assert fb_res.json()["rating"] == -1

            # Employee conversations are private: Admin cannot list or open Employee's private chat thread
            admin_convs = await client.get("/api/v1/conversations", headers=admin_headers)
            assert all(c["id"] != conv_id for c in admin_convs.json())

            # Company Admin sees Knowledge Gap & Overview feedback score
            overview = await client.get("/api/v1/company/overview", headers=admin_headers)
            assert overview.status_code == 200
            assert overview.json()["total_feedback_count"] == 1
            assert overview.json()["helpful_rate_pct"] == 0.0
            assert len(overview.json()["recent_gaps"]) >= 1
            assert overview.json()["recent_gaps"][0]["question"] == "What is our leave policy?"

            # 8. Switch policy to DOMAIN_AUTO_JOIN -> second employee joins automatically without approval step
            auto_upd = await client.patch(
                "/api/v1/company/settings",
                headers=admin_headers,
                json={"join_policy": "DOMAIN_AUTO_JOIN", "default_join_role": "EMPLOYEE"},
            )
            assert auto_upd.status_code == 200

            reg_emp2 = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": "anita@infosys.com",
                    "password": "EmpPassword123!",
                    "account_type": "employee",
                },
            )
            assert reg_emp2.status_code == 201
            assert reg_emp2.json()["active_workspace"]["name"] == "Infosys"
            assert reg_emp2.json()["active_workspace"]["role"] == "EMPLOYEE"

            # 9. Public company portal resolution exposes company branding only (never personal slugs)
            portal_pub = await client.get("/api/v1/auth/company-portal/infosys")
            assert portal_pub.status_code == 200
            assert portal_pub.json()["company_name"] == "Infosys"
            assert portal_pub.json()["slug"] == "infosys"
            assert (await client.get("/api/v1/auth/company-portal/ws-personal-test")).status_code == 404

            # 10. Create a completely separate Company B ("Acme") with confidential document -> enforce strict cross-company isolation
            reg_acme = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": "boss@acme.io",
                    "password": "StrongPassword123!",
                    "account_type": "company",
                    "company_name": "Acme Corp",
                    "claim_domain": False,
                },
            )
            assert reg_acme.status_code == 201
            acme_ws_id = uuid.UUID(reg_acme.json()["active_workspace"]["id"])
            acme_slug = reg_acme.json()["active_workspace"]["slug"]

            async with async_session() as s:
                acme_doc = Document(
                    workspace_id=acme_ws_id,
                    uploaded_by=uuid.UUID(reg_acme.json()["id"]),
                    filename="acme_secret_roadmap.pdf",
                    mime_type="application/pdf",
                    size_bytes=2048,
                    checksum_sha256="b" * 64,
                    object_key=f"raw/{acme_ws_id}/acme_secret.bin",
                    status=DocumentStatus.READY.value,
                    page_count=3,
                )
                s.add(acme_doc)
                await s.flush()
                s.add(
                    DocumentChunk(
                        workspace_id=acme_ws_id,
                        document_id=acme_doc.id,
                        chunk_index=0,
                        content="TOP SECRET ACME SALARY MATRIX AND M&A TARGETS",
                        page_start=1,
                        page_end=1,
                        section_path="Confidential",
                        token_count=10,
                    )
                )
                await s.commit()
                acme_doc_id = acme_doc.id

            # Infosys employee tries to pass Acme's X-Workspace-ID -> 403 Forbidden
            cross_ws_docs = await client.get(
                "/api/v1/documents",
                headers={"Authorization": f"Bearer {emp_tok}", "X-Workspace-ID": str(acme_ws_id)},
            )
            assert cross_ws_docs.status_code == 403

            # Infosys employee tries to search or chat passing Acme's document ID explicitly -> never retrieves Acme content
            cross_search = await client.post(
                "/api/v1/search",
                headers=emp_headers,
                json={"query": "ACME SALARY MATRIX", "document_ids": [str(acme_doc_id)]},
            )
            assert cross_search.status_code == 200
            assert cross_search.json()["total_found"] == 0

            cross_chat = await client.post(
                f"/api/v1/conversations/{conv_id}/messages",
                headers=emp_headers,
                json={"content": "What is ACME SALARY MATRIX?", "document_ids": [str(acme_doc_id)]},
            )
            assert cross_chat.status_code == 400

            # Invite-only portal registration via target_company_slug is blocked unless invited or DOMAIN_APPROVAL enabled
            blocked_req = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": "outsider@gmail.com",
                    "password": "StrongPassword123!",
                    "account_type": "employee",
                    "target_company_slug": acme_slug,
                },
            )
            assert blocked_req.status_code == 403

    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


def test_company_and_employee_enterprise_flow():
    asyncio.run(_run_test_company_and_employee_enterprise_flow())

