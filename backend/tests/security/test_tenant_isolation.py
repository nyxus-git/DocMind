import asyncio
from unittest.mock import patch
import uuid
import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.adapters.storage.local import LocalStorage
from app.core.http_safety import csv_safe_cell, resolve_safe_inline_mime
from app.db.session import get_db
from app.main import app
from app.models.entities import Base, Document, DocumentChunk, User, Workspace, WorkspaceMember
from app.models.enums import DocumentStatus, WorkspaceRole


@pytest.fixture
def sync_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_tenant_isolation_boundary(sync_db: Session):
    # 1. Create Tenant A
    user_a = User(id=uuid.uuid4(), email="tenant_a@docmind.ai", password_hash="hash_a")
    ws_a = Workspace(id=uuid.uuid4(), name="Workspace A", slug="ws-a", created_by=user_a.id)
    mem_a = WorkspaceMember(workspace_id=ws_a.id, user_id=user_a.id, role=WorkspaceRole.OWNER.value)
    
    # 2. Create Tenant B
    user_b = User(id=uuid.uuid4(), email="tenant_b@docmind.ai", password_hash="hash_b")
    ws_b = Workspace(id=uuid.uuid4(), name="Workspace B", slug="ws-b", created_by=user_b.id)
    mem_b = WorkspaceMember(workspace_id=ws_b.id, user_id=user_b.id, role=WorkspaceRole.OWNER.value)

    sync_db.add_all([user_a, ws_a, mem_a, user_b, ws_b, mem_b])
    sync_db.commit()

    # 3. Tenant A uploads a document
    doc_a = Document(
        id=uuid.uuid4(),
        workspace_id=ws_a.id,
        uploaded_by=user_a.id,
        filename="confidential_audit_report.pdf",
        mime_type="application/pdf",
        size_bytes=1024,
        checksum_sha256="a" * 64,
        object_key=f"raw/{ws_a.id}/doc_a.bin",
        status=DocumentStatus.READY.value
    )
    sync_db.add(doc_a)
    sync_db.commit()

    # 4. Attempt to query Tenant A's document within Tenant B's workspace context
    query = sync_db.query(Document).filter(
        Document.id == doc_a.id,
        Document.workspace_id == ws_b.id  # Tenant B context
    ).first()

    assert query is None, "SECURITY FAILURE: Cross-tenant IDOR leakage detected!"

    # 5. Query within Tenant A's workspace context succeeds
    valid_query = sync_db.query(Document).filter(
        Document.id == doc_a.id,
        Document.workspace_id == ws_a.id
    ).first()

    assert valid_query is not None
    assert valid_query.filename == "confidential_audit_report.pdf"


async def _run_security_hardening_and_document_open_checks():
    assert resolve_safe_inline_mime("evil.html", "text/html") == "text/plain; charset=utf-8"
    assert resolve_safe_inline_mime("handbook.pdf", "application/octet-stream") == "application/pdf"
    assert csv_safe_cell("=HYPERLINK(\"http://evil\")").startswith("'")
    assert csv_safe_cell("normal_text") == "normal_text"

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
    local_storage = LocalStorage()
    p_doc_st = patch("app.services.document.get_storage", return_value=local_storage)
    p_api_st = patch("app.api.v1.documents.get_storage", return_value=local_storage)
    p_doc_st.start()
    p_api_st.start()

    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            # 1. CORS must NOT reflect arbitrary evil origin on error responses
            cors_probe = await client.post(
                "/api/v1/auth/login",
                headers={"Origin": "https://evil-attacker.example"},
                json={"email": "missing@example.com", "password": "wrong"},
            )
            assert "access-control-allow-origin" not in cors_probe.headers

            # 2. Register user & create workspace -> verify /me email escalation & member OWNER escalation blocked
            reg = await client.post(
                "/api/v1/auth/register",
                json={"email": "owner@sec.io", "password": "StrongPassword123!", "account_type": "company", "company_name": "SecCorp"},
            )
            assert reg.status_code == 201
            ws_id = uuid.UUID(reg.json()["active_workspace"]["id"])
            owner_id = uuid.UUID(reg.json()["id"])

            login = await client.post("/api/v1/auth/login", json={"email": "owner@sec.io", "password": "StrongPassword123!"})
            assert login.status_code == 200
            owner_headers = {"Authorization": f"Bearer {login.json()['access_token']}", "X-Workspace-ID": str(ws_id)}

            # Block switching email to reserved PLATFORM_ADMIN_EMAIL via PATCH /me
            esc_me = await client.patch(
                "/api/v1/me",
                headers=owner_headers,
                json={"email": "admin@docmind.com"},
            )
            assert esc_me.status_code == 403

            # Provision an admin + employee, verify ADMIN cannot promote self to OWNER via PATCH /members/{id}
            prov = await client.post(
                "/api/v1/company/employees/provision",
                headers=owner_headers,
                json={"emails": ["secadmin@sec.io", "emp@sec.io"], "password": "BatchPassword#2026", "role": "ADMIN"},
            )
            assert prov.status_code == 200

            adm_login = await client.post("/api/v1/auth/login", json={"email": "secadmin@sec.io", "password": "BatchPassword#2026"})
            assert adm_login.status_code == 200
            adm_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}", "X-Workspace-ID": str(ws_id)}

            mems = await client.get(f"/api/v1/workspaces/{ws_id}/members", headers=owner_headers)
            adm_uid = next(m["user_id"] for m in mems.json() if m["email"] == "secadmin@sec.io")

            promote_owner = await client.patch(
                f"/api/v1/workspaces/{ws_id}/members/{adm_uid}",
                headers=adm_headers,
                json={"role": "OWNER"},
            )
            assert promote_owner.status_code == 400

            # 3. Document download returns 404 STORAGE_OBJECT_MISSING when binary is absent, while /content returns indexed chunks
            #    AND when binary IS uploaded to storage, /download-url returns signed URL serving inline PDF MIME!
            missing_doc_id = uuid.uuid4()
            present_doc_id = uuid.uuid4()
            local_key = f"raw/{ws_id}/{present_doc_id}.bin"
            await local_storage.save_bytes(local_key, b"%PDF-1.4 sample content")

            async with async_session() as s:
                s.add_all([
                    Document(
                        id=missing_doc_id,
                        workspace_id=ws_id,
                        uploaded_by=owner_id,
                        filename="legacy_missing.pdf",
                        mime_type="application/pdf",
                        size_bytes=512,
                        checksum_sha256="a" * 64,
                        object_key=f"raw/{ws_id}/missing_legacy.bin",
                        status=DocumentStatus.READY.value,
                        page_count=2,
                    ),
                    DocumentChunk(
                        workspace_id=ws_id,
                        document_id=missing_doc_id,
                        chunk_index=0,
                        content="Indexed legacy handbook page 1 text.",
                        page_start=1,
                        page_end=1,
                        section_path="Page 1",
                    ),
                    Document(
                        id=present_doc_id,
                        workspace_id=ws_id,
                        uploaded_by=owner_id,
                        filename="valid_policy.pdf",
                        mime_type="application/octet-stream",
                        size_bytes=23,
                        checksum_sha256="b" * 64,
                        object_key=local_key,
                        status=DocumentStatus.READY.value,
                        page_count=1,
                    ),
                ])
                await s.commit()

            try:
                dl_missing = await client.post(f"/api/v1/documents/{missing_doc_id}/download-url", headers=adm_headers)
                assert dl_missing.status_code == 404
                assert dl_missing.json()["code"] == "STORAGE_OBJECT_MISSING"

                content_res = await client.get(f"/api/v1/documents/{missing_doc_id}/content", headers=adm_headers)
                assert content_res.status_code == 200
                assert content_res.json()["storage_available"] is False
                assert content_res.json()["chunks"][0]["content"] == "Indexed legacy handbook page 1 text."

                dl_ok = await client.post(f"/api/v1/documents/{present_doc_id}/download-url", headers=adm_headers)
                assert dl_ok.status_code == 200
                signed_url = dl_ok.json()["download_url"]
                assert "valid_policy.pdf" in signed_url

                # Follow local mock-storage path in ASGI client to verify inline PDF headers
                local_path = "/api/v1/" + signed_url.split("/api/v1/")[1]
                file_resp = await client.get(local_path)
                assert file_resp.status_code == 200
                assert file_resp.headers["content-type"].startswith("application/pdf")
                assert "inline;" in file_resp.headers.get("content-disposition", "")
            finally:
                await local_storage.delete_object(local_key)
    finally:
        p_doc_st.stop()
        p_api_st.stop()
        app.dependency_overrides.clear()
        await engine.dispose()


def test_security_hardening_and_document_open_checks():
    asyncio.run(_run_security_hardening_and_document_open_checks())
