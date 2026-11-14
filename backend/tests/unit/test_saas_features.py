import asyncio
import uuid
import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from app.api.v1.dependencies import get_current_user
from app.core.rate_limit import SlidingWindowLimiter
from app.db.session import get_db
from app.ingestion.parsers.structured import parse_csv, parse_html, parse_json_doc
from app.ingestion.validator import validate_file_metadata
from app.main import app
from app.models.entities import Base, Conversation, Document, DocumentChunk, KnowledgeSpace, Message, User, Workspace, WorkspaceMember
from app.models.enums import UserStatus, WorkspaceRole, WorkspaceTier
from app.repositories.workspace import WorkspaceRepository
from app.services.auth import AuthService


def test_structured_parsers_and_tier_validation():
    csv_doc = parse_csv(b"Company,Plan,Seats\nAcme,PRO,25\nGlobex,ENTERPRISE,500")
    assert csv_doc.total_char_count > 10
    assert "Acme" in csv_doc.blocks[0].text

    json_doc = parse_json_doc(b'{"tier":"ENTERPRISE","max_docs":5000}')
    assert "ENTERPRISE" in json_doc.blocks[0].text

    html_doc = parse_html(b"<html><head><script>alert(1)</script></head><body><h1>MSA Terms</h1><p>Liability capped at 12 months.</p></body></html>")
    joined = "\n".join(b.text for b in html_doc.blocks)
    assert "MSA Terms" in joined
    assert "alert(1)" not in joined

    # Tier-aware validation allows 35 MB on Pro (50 MB limit)
    validate_file_metadata("big.csv", "text/csv", 35 * 1024 * 1024, max_file_mb=50)


def test_sliding_window_rate_limiter():
    limiter = SlidingWindowLimiter()
    for _ in range(5):
        allowed, retry_after = limiter.check("auth:1.2.3.4", max_requests=5, window_seconds=60)
        assert allowed is True
        assert retry_after == 0

    blocked, retry_after = limiter.check("auth:1.2.3.4", max_requests=5, window_seconds=60)
    assert blocked is False
    assert retry_after >= 1


async def _run_test_rbac_invites_api_keys_and_admin():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(bind=engine, expire_on_commit=False)

    owner = User(
        id=uuid.uuid4(),
        email="owner@acme.com",
        password_hash="h_owner",
        status=UserStatus.ACTIVE.value,
        is_superadmin=False,
    )
    viewer = User(
        id=uuid.uuid4(),
        email="viewer@acme.com",
        password_hash="h_viewer",
        status=UserStatus.ACTIVE.value,
        is_superadmin=False,
    )
    super_admin = User(
        id=uuid.uuid4(),
        email="admin@docmind.com",
        password_hash="h_admin",
        status=UserStatus.ACTIVE.value,
        is_superadmin=True,
    )

    async with async_session() as s:
        s.add_all([owner, viewer, super_admin])
        await s.flush()
        ws_repo = WorkspaceRepository(s)
        ws = await ws_repo.create_workspace("Acme SaaS", "acme-saas", owner.id, WorkspaceTier.PRO.value)
        await ws_repo.add_member(ws.id, viewer.id, WorkspaceRole.VIEWER.value)
        await s.commit()
        ws_id = ws.id

    active_user = viewer

    async def override_get_db():
        async with async_session() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    async def override_user():
        return active_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            # 1. VIEWER can read documents, but CANNOT upload or create conversations
            docs_read = await client.get("/api/v1/documents", headers={"X-Workspace-ID": str(ws_id)})
            assert docs_read.status_code == 200

            upload_denied = await client.post(
                "/api/v1/documents/upload-intents",
                headers={"X-Workspace-ID": str(ws_id)},
                json={
                    "filename": "report.pdf",
                    "declared_mime": "application/pdf",
                    "size_bytes": 1024,
                    "checksum_sha256": "a" * 64,
                },
            )
            assert upload_denied.status_code == 403
            assert upload_denied.json()["code"] == "INSUFFICIENT_PERMISSIONS"

            chat_denied = await client.post(
                "/api/v1/conversations",
                headers={"X-Workspace-ID": str(ws_id)},
                json={"title": "Test"},
            )
            assert chat_denied.status_code == 403

            # 2. Switch to OWNER: invite a brand-new email
            active_user = owner
            inv_res = await client.post(
                f"/api/v1/workspaces/{ws_id}/invites",
                json={"email": "newjoiner@acme.com", "role": "MEMBER"},
            )
            assert inv_res.status_code == 200
            assert inv_res.json()["status"] == "INVITED"

            list_inv = await client.get(f"/api/v1/workspaces/{ws_id}/invites")
            assert list_inv.status_code == 200
            assert len(list_inv.json()) == 1
            assert list_inv.json()[0]["email"] == "newjoiner@acme.com"

            # Register newjoiner -> automatically accepts pending invite!
            async with async_session() as reg_sess:
                auth_svc = AuthService(reg_sess)
                new_user, _, _ = await auth_svc.register("newjoiner@acme.com", "StrongPass123!")
                await reg_sess.commit()

                joined_ws = await WorkspaceRepository(reg_sess).get_user_workspaces(new_user.id)
                joined_ids = [w.id for w, _ in joined_ws]
                assert ws_id in joined_ids

            # Pending invites should now be empty (accepted)
            list_inv_after = await client.get(f"/api/v1/workspaces/{ws_id}/invites")
            assert list_inv_after.status_code == 200
            assert len(list_inv_after.json()) == 0

            # 3. Create & authenticate using X-API-Key (without user override)
            key_res = await client.post(
                f"/api/v1/workspaces/{ws_id}/api-keys",
                json={"name": "CI Pipeline", "scopes": ["read", "write"]},
            )
            assert key_res.status_code == 201
            secret_key = key_res.json()["secret_key"]
            key_id = key_res.json()["id"]
            assert secret_key.startswith("dm_live_")

            app.dependency_overrides.pop(get_current_user, None)
            api_docs_res = await client.get("/api/v1/documents", headers={"X-API-Key": secret_key})
            assert api_docs_res.status_code == 200

            # API Key cannot spoof another tenant header
            spoof_res = await client.get(
                "/api/v1/documents",
                headers={"X-API-Key": secret_key, "X-Workspace-ID": str(uuid.uuid4())},
            )
            assert spoof_res.status_code == 403

            # Revoke key -> rejects immediately with 401
            app.dependency_overrides[get_current_user] = override_user
            del_key_res = await client.delete(f"/api/v1/workspaces/{ws_id}/api-keys/{key_id}")
            assert del_key_res.status_code == 204

            app.dependency_overrides.pop(get_current_user, None)
            revoked_res = await client.get("/api/v1/documents", headers={"X-API-Key": secret_key})
            assert revoked_res.status_code == 401

            # 4. Super-admin can provision workspace & inspect jobs & export CSV audit logs
            active_user = super_admin
            app.dependency_overrides[get_current_user] = override_user

            prov_res = await client.post(
                "/api/v1/admin/workspaces",
                json={
                    "name": "Wipro Enterprise",
                    "owner_email": "cto@wipro.com",
                    "owner_password": "Password123!",
                    "tier": "ENTERPRISE",
                },
            )
            assert prov_res.status_code == 201
            assert prov_res.json()["name"] == "Wipro Enterprise"
            assert prov_res.json()["tier"] == "ENTERPRISE"

            jobs_res = await client.get("/api/v1/admin/jobs")
            assert jobs_res.status_code == 200

            csv_res = await client.get("/api/v1/admin/audit-logs/export")
            assert csv_res.status_code == 200
            assert "text/csv" in csv_res.headers["content-type"]

    finally:
        app.dependency_overrides.clear()


def test_rbac_invites_api_keys_and_admin():
    asyncio.run(_run_test_rbac_invites_api_keys_and_admin())


async def _run_test_webhooks_compliance_insights_and_batch_ops():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(bind=engine, expire_on_commit=False)

    owner = User(
        id=uuid.uuid4(),
        email="compliance_owner@corp.com",
        password_hash="h_owner",
        status=UserStatus.ACTIVE.value,
        is_superadmin=False,
    )

    async with async_session() as s:
        s.add(owner)
        await s.flush()
        ws_repo = WorkspaceRepository(s)
        ws = await ws_repo.create_workspace("FinTech Labs", "fintech-labs", owner.id, WorkspaceTier.ENTERPRISE.value)
        ws_id = ws.id
        space = KnowledgeSpace(
            id=uuid.uuid4(),
            workspace_id=ws_id,
            name="Legal & Compliance",
            slug="legal-comp",
            created_by=owner.id,
        )
        s.add(space)
        await s.flush()
        space_id = space.id

        # Insert a document with sensitive content for compliance scan
        doc = Document(
            id=uuid.uuid4(),
            workspace_id=ws_id,
            uploaded_by=owner.id,
            filename="Vendor_NDA_Sensitive.pdf",
            mime_type="application/pdf",
            size_bytes=4096,
            checksum_sha256="0" * 64,
            object_key="fintech/docs/nda.pdf",
            status="READY",
            page_count=2,
        )
        s.add(doc)
        await s.flush()
        doc_id = doc.id

        chunk1 = DocumentChunk(
            id=uuid.uuid4(),
            workspace_id=ws_id,
            document_id=doc_id,
            chunk_index=0,
            content="This agreement is STRICTLY CONFIDENTIAL. Live API access token: sk_live_99887766554433221100aa.",
            page_start=1,
            token_count=20,
        )
        chunk2 = DocumentChunk(
            id=uuid.uuid4(),
            workspace_id=ws_id,
            document_id=doc_id,
            chunk_index=1,
            content="Customer billing contact: john.doe@enterprise-client.com. Social Security: 123-45-6789.",
            page_start=2,
            token_count=18,
        )
        s.add_all([chunk1, chunk2])

        # Also insert a conversation for export test
        conv = Conversation(
            id=uuid.uuid4(),
            workspace_id=ws_id,
            created_by=owner.id,
            title="NDA Risk Review",
            scope_mode="all",
        )
        s.add(conv)
        await s.flush()
        conv_id = conv.id

        msg_user = Message(
            id=uuid.uuid4(),
            conversation_id=conv_id,
            role="user",
            content="What are the confidentiality obligations?",
        )
        msg_asst = Message(
            id=uuid.uuid4(),
            conversation_id=conv_id,
            role="assistant",
            content="The agreement is strictly confidential and restricts disclosure [S1].",
        )
        s.add_all([msg_user, msg_asst])
        await s.commit()

    async def override_get_db():
        async with async_session() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    def override_user():
        return owner

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"X-Workspace-ID": str(ws_id)}

            # 1. Compliance Scan on document
            scan_res = await client.post(f"/api/v1/documents/{doc_id}/compliance-scan", headers=headers)
            assert scan_res.status_code == 200
            scan_data = scan_res.json()
            assert scan_data["risk_score"] > 0
            assert scan_data["findings_count"] >= 2
            assert any(f["category"] == "SECRET_CREDENTIAL" for f in scan_data["findings"])
            assert any(f["category"] == "GOVERNMENT_ID" for f in scan_data["findings"])

            # Workspace Compliance Summary
            sum_res = await client.get(f"/api/v1/workspaces/{ws_id}/compliance-summary")
            assert sum_res.status_code == 200
            sum_data = sum_res.json()
            assert sum_data["total_documents"] == 1
            assert sum_data["at_risk_documents"] == 1

            # 2. Webhook Management (Create, List, Test Ping, Delete)
            hook_res = await client.post(
                f"/api/v1/workspaces/{ws_id}/webhooks",
                json={
                    "url": "https://webhook.site/test-endpoint",
                    "description": "Slack Notifications",
                    "events": ["document.ready", "document.failed"],
                },
            )
            assert hook_res.status_code == 201
            hook_data = hook_res.json()
            assert hook_data["secret"].startswith("whsec_")
            hook_id = hook_data["id"]

            list_hooks = await client.get(f"/api/v1/workspaces/{ws_id}/webhooks")
            assert list_hooks.status_code == 200
            assert len(list_hooks.json()) == 1

            test_ping = await client.post(f"/api/v1/workspaces/{ws_id}/webhooks/{hook_id}/test")
            assert test_ping.status_code == 200
            ping_data = test_ping.json()
            assert "webhook_id" in ping_data

            del_hook = await client.delete(f"/api/v1/workspaces/{ws_id}/webhooks/{hook_id}")
            assert del_hook.status_code == 204

            # 3. Saved Insights & Research Notebook
            ins_res = await client.post(
                f"/api/v1/workspaces/{ws_id}/insights",
                json={
                    "title": "Vendor Non-Compete Period",
                    "question": "What is the non-compete duration?",
                    "answer": "24 months following agreement termination [S1].",
                    "tags": ["legal", "procurement"],
                },
            )
            assert ins_res.status_code == 201
            ins_data = ins_res.json()
            ins_id = ins_data["id"]

            list_ins = await client.get(f"/api/v1/workspaces/{ws_id}/insights")
            assert list_ins.status_code == 200
            assert len(list_ins.json()) == 1
            assert list_ins.json()[0]["title"] == "Vendor Non-Compete Period"

            del_ins = await client.delete(f"/api/v1/workspaces/{ws_id}/insights/{ins_id}")
            assert del_ins.status_code == 204

            # 4. Batch Document Operations
            assign_res = await client.post(
                "/api/v1/documents/batch-assign-space",
                headers=headers,
                json={"document_ids": [str(doc_id)], "space_id": str(space_id)},
            )
            assert assign_res.status_code == 200
            assert assign_res.json()["updated_count"] == 1

            batch_del_res = await client.post(
                "/api/v1/documents/batch-delete",
                headers=headers,
                json={"document_ids": [str(doc_id)]},
            )
            assert batch_del_res.status_code == 200
            assert batch_del_res.json()["deleted_count"] == 1

            # 5. Conversation Export
            exp_res = await client.get(f"/api/v1/conversations/{conv_id}/export", headers=headers)
            assert exp_res.status_code == 200
            exp_data = exp_res.json()
            assert "NDA Risk Review" in exp_data["markdown_export"]
            assert "confidentiality obligations" in exp_data["markdown_export"]

    finally:
        app.dependency_overrides.clear()


def test_webhooks_compliance_insights_and_batch_ops():
    asyncio.run(_run_test_webhooks_compliance_insights_and_batch_ops())


