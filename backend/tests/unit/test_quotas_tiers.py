import asyncio
import uuid
from decimal import Decimal
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from app.core.exceptions import QuotaExceededException
from app.models.entities import (
    AuditEvent,
    Base,
    Document,
    UsageEvent,
    User,
    Workspace,
    WorkspaceMember,
)
from app.models.enums import DocumentStatus, WorkspaceRole, WorkspaceTier
from app.repositories.audit import AuditRepository
from app.repositories.document import DocumentRepository
from app.repositories.usage import UsageRepository
from app.repositories.workspace import WorkspaceRepository
from app.services.quota import QuotaService


async def _run_test_quotas_and_tiers():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with async_session() as session:
        user_id = uuid.uuid4()
        ws_starter_id = uuid.uuid4()
        ws_pro_id = uuid.uuid4()

        user = User(id=user_id, email="founder@docmind.ai", password_hash="hashed")
        ws_starter = Workspace(
            id=ws_starter_id,
            name="Personal Sandbox",
            slug="personal-sandbox",
            tier=WorkspaceTier.STARTER.value,
            created_by=user_id
        )
        ws_pro = Workspace(
            id=ws_pro_id,
            name="Acme Corp Pro",
            slug="acme-pro",
            tier=WorkspaceTier.PRO.value,
            created_by=user_id
        )
        member_starter = WorkspaceMember(workspace_id=ws_starter_id, user_id=user_id, role=WorkspaceRole.OWNER.value)
        member_pro = WorkspaceMember(workspace_id=ws_pro_id, user_id=user_id, role=WorkspaceRole.OWNER.value)

        session.add_all([user, ws_starter, ws_pro, member_starter, member_pro])
        await session.commit()

        doc_repo = DocumentRepository(session)
        usage_repo = UsageRepository(session)
        ws_repo = WorkspaceRepository(session)
        audit_repo = AuditRepository(session)
        quota_service = QuotaService(doc_repo, usage_repo, ws_repo)

        # 1. Test Starter tier usage summary
        starter_summary = await quota_service.get_usage_summary(ws_starter_id, user_id)
        assert starter_summary.tier == "STARTER"
        assert starter_summary.documents_limit == 20
        assert starter_summary.questions_limit == 100
        assert starter_summary.max_members_limit == 1
        assert starter_summary.concurrent_uploads_limit == 2

        # 2. Test Pro tier usage summary
        pro_summary = await quota_service.get_usage_summary(ws_pro_id, user_id)
        assert pro_summary.tier == "PRO"
        assert pro_summary.documents_limit == 500
        assert pro_summary.questions_limit == 2500
        assert pro_summary.max_members_limit == 25
        assert pro_summary.concurrent_uploads_limit == 5

        # 3. Test Member Invite quota on Starter tier (cap = 1 member, already has 1)
        with pytest.raises(QuotaExceededException) as exc_invite:
            await quota_service.check_member_invite_quota(ws_starter_id)
        assert exc_invite.value.code == "WORKSPACE_MEMBER_LIMIT_REACHED"

        # 4. Pro tier permits member invite
        await quota_service.check_member_invite_quota(ws_pro_id)  # Does not raise

        # 5. Test File Size Limit on Starter tier (max 20 MB = 20 * 1024 * 1024)
        oversized_bytes = 25 * 1024 * 1024
        with pytest.raises(QuotaExceededException) as exc_file:
            await quota_service.check_upload_quota(ws_starter_id, oversized_bytes, user_id=user_id)
        assert exc_file.value.code == "FILE_TOO_LARGE"

        # 6. Pro tier allows 25 MB file (max 50 MB)
        await quota_service.check_upload_quota(ws_pro_id, oversized_bytes, user_id=user_id)  # Does not raise

        # 7. Test Concurrent Uploads Guard (Starter cap = 2 active uploads)
        doc1 = Document(
            id=uuid.uuid4(),
            workspace_id=ws_starter_id,
            uploaded_by=user_id,
            filename="doc1.pdf",
            mime_type="application/pdf",
            size_bytes=1000,
            checksum_sha256="111" * 21 + "1",
            object_key="raw/doc1.bin",
            status=DocumentStatus.UPLOADING.value
        )
        doc2 = Document(
            id=uuid.uuid4(),
            workspace_id=ws_starter_id,
            uploaded_by=user_id,
            filename="doc2.pdf",
            mime_type="application/pdf",
            size_bytes=1000,
            checksum_sha256="222" * 21 + "2",
            object_key="raw/doc2.bin",
            status=DocumentStatus.QUEUED.value
        )
        session.add_all([doc1, doc2])
        await session.commit()

        # User now has 2 concurrent active uploads, 3rd should fail
        with pytest.raises(QuotaExceededException) as exc_concurrent:
            await quota_service.check_upload_quota(ws_starter_id, 1000, user_id=user_id)
        assert exc_concurrent.value.code == "CONCURRENT_UPLOADS_EXCEEDED"

        # 8. Test Monthly Question Quota
        # Log 100 questions for user
        for i in range(100):
            session.add(
                UsageEvent(
                    workspace_id=ws_starter_id,
                    user_id=user_id,
                    event_type="question",
                    provider="google",
                    model="gemini-3.8-flash",
                    units=100,
                    cost_usd=Decimal("0.001")
                )
            )
        await session.commit()

        # Starter workspace: 100 reached -> fails
        with pytest.raises(QuotaExceededException) as exc_q:
            await quota_service.check_question_quota(ws_starter_id, user_id)
        assert exc_q.value.code == "MONTHLY_QUESTION_LIMIT_REACHED"

        # Pro workspace: limit is 2500 -> passes
        await quota_service.check_question_quota(ws_pro_id, user_id)

        # 9. Test Tier Upgrade: Upgrade Starter workspace to PRO
        updated_ws = await ws_repo.update_tier(ws_starter_id, WorkspaceTier.PRO.value)
        assert updated_ws is not None
        assert updated_ws.tier == "PRO"

        # After upgrade, question quota check passes!
        await quota_service.check_question_quota(ws_starter_id, user_id)

        # 10. Test Audit Repository logging and retrieval
        event = await audit_repo.record_event(
            workspace_id=ws_starter_id,
            actor_user_id=user_id,
            action="WORKSPACE_TIER_UPDATED",
            target_type="workspace",
            target_id=ws_starter_id,
            metadata={"from": "STARTER", "to": "PRO"}
        )
        assert event.id is not None
        assert event.action == "WORKSPACE_TIER_UPDATED"

        events_list = await audit_repo.list_events(ws_starter_id)
        assert len(events_list) >= 1
        ev, actor_email = events_list[0]
        assert ev.action == "WORKSPACE_TIER_UPDATED"
        assert actor_email == "founder@docmind.ai"


def test_quotas_and_tiers():
    asyncio.run(_run_test_quotas_and_tiers())

