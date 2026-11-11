import asyncio
import uuid
from typing import Any, Dict, List
from unittest.mock import patch
import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from app.adapters.ai.gemini import GeminiEmbedding
from app.core.exceptions import DocMindException, ServiceDegradedException
from app.models.entities import Base, Document, Job, User, Workspace
from app.models.enums import DocumentErrorCode, DocumentStatus, JobStatus, JobType
from app.repositories.document import DocumentRepository
from app.repositories.job import JobRepository
from app.workers.runner import _finalize_failed_job


async def _run_test_gemini_embedding_retries_on_429():
    calls: List[int] = []
    slept: List[float] = []

    class FakeClient:
        def __init__(self, *args: Any, **kwargs: Any):
            pass

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *args: Any) -> None:
            return None

        async def post(self, url: str, json: Dict[str, Any]) -> httpx.Response:
            calls.append(len(calls) + 1)
            if len(calls) == 1:
                return httpx.Response(
                    429,
                    json={"error": {"code": 429, "message": "Rate limit exceeded. Please retry in 12.5s."}},
                )
            vectors = [[0.25] * 768 for _ in json["requests"]]
            return httpx.Response(
                200,
                json={"embeddings": [{"values": v} for v in vectors]},
            )

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)

    embedder = GeminiEmbedding(api_key="fake-key", model="gemini-embedding-001")
    with patch("app.adapters.ai.gemini.httpx.AsyncClient", FakeClient), patch(
        "app.adapters.ai.gemini.asyncio.sleep", fake_sleep
    ):
        result = await embedder.embed_documents(["chunk one", "chunk two"])

    assert len(result) == 2
    assert result[0][0] == 0.25
    assert len(calls) == 2
    assert len(slept) == 1
    assert 14.0 <= slept[0] <= 15.0

    # Interactive query path should not sleep for 429 backoff
    calls.clear()
    slept.clear()
    with patch("app.adapters.ai.gemini.httpx.AsyncClient", FakeClient), patch(
        "app.adapters.ai.gemini.asyncio.sleep", fake_sleep
    ):
        query_vec = await embedder.embed_query("quick question")
    assert len(query_vec) == 768
    assert slept == []


def test_gemini_embedding_retries_on_429():
    asyncio.run(_run_test_gemini_embedding_retries_on_429())


async def _run_test_finalize_failed_job_updates_document_status():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    user_id = uuid.uuid4()
    ws_id = uuid.uuid4()
    doc1_id = uuid.uuid4()
    doc2_id = uuid.uuid4()

    async with session_factory() as s:
        s.add(User(id=user_id, email="worker@test.io", password_hash="h"))
        s.add(Workspace(id=ws_id, name="Test WS", slug=f"ws-{ws_id.hex[:6]}", created_by=user_id))
        s.add(
            Document(
                id=doc1_id,
                workspace_id=ws_id,
                uploaded_by=user_id,
                filename="large.pdf",
                mime_type="application/pdf",
                size_bytes=1024,
                checksum_sha256="a" * 64,
                object_key=f"raw/{ws_id}/{doc1_id}.bin",
                status=DocumentStatus.PROCESSING.value,
            )
        )
        s.add(
            Document(
                id=doc2_id,
                workspace_id=ws_id,
                uploaded_by=user_id,
                filename="corrupt.pdf",
                mime_type="application/pdf",
                size_bytes=512,
                checksum_sha256="b" * 64,
                object_key=f"raw/{ws_id}/{doc2_id}.bin",
                status=DocumentStatus.PROCESSING.value,
            )
        )
        job1 = await JobRepository(s).enqueue_job(
            workspace_id=ws_id,
            job_type=JobType.INGEST_DOCUMENT.value,
            payload={"document_id": str(doc1_id)},
        )
        job1.attempts = 1
        job2 = await JobRepository(s).enqueue_job(
            workspace_id=ws_id,
            job_type=JobType.INGEST_DOCUMENT.value,
            payload={"document_id": str(doc2_id)},
        )
        job2.attempts = 1
        await s.commit()

    # 1. Transient retryable error on attempt 1/3 -> RETRY_WAIT + Document returns to QUEUED
    err_transient = ServiceDegradedException("Rate limited temporarily")
    await _finalize_failed_job(job1.id, job1.job_type, job1.payload, err_transient, session_factory=session_factory)

    async with session_factory() as s:
        j1 = await JobRepository(s).get_by_id(job1.id)
        d1 = await DocumentRepository(s).get_by_id_unscoped(doc1_id)
        assert j1 is not None and j1.status == JobStatus.RETRY_WAIT.value
        assert d1 is not None and d1.status == DocumentStatus.QUEUED.value
        j1.attempts = 3
        await s.commit()

    # 2. Exhausted attempt 3/3 -> FAILED + Document MUST move to FAILED with error info
    await _finalize_failed_job(job1.id, job1.job_type, job1.payload, err_transient, session_factory=session_factory)
    async with session_factory() as s:
        j1 = await JobRepository(s).get_by_id(job1.id)
        d1 = await DocumentRepository(s).get_by_id_unscoped(doc1_id)
        assert j1 is not None and j1.status == JobStatus.FAILED.value
        assert d1 is not None and d1.status == DocumentStatus.FAILED.value
        assert d1.error_code == "SERVICE_DEGRADED"
        assert d1.error_message == "Rate limited temporarily"

    # 3. Non-retryable validation failure -> fails immediately on attempt 1
    err_corrupt = DocMindException(400, DocumentErrorCode.CORRUPT_FILE.value, "Corrupt", "Invalid PDF header")
    await _finalize_failed_job(job2.id, job2.job_type, job2.payload, err_corrupt, session_factory=session_factory)
    async with session_factory() as s:
        j2 = await JobRepository(s).get_by_id(job2.id)
        d2 = await DocumentRepository(s).get_by_id_unscoped(doc2_id)
        assert j2 is not None and j2.status == JobStatus.FAILED.value
        assert d2 is not None and d2.status == DocumentStatus.FAILED.value
        assert d2.error_code == DocumentErrorCode.CORRUPT_FILE.value
        assert d2.error_message == "Invalid PDF header"

    await engine.dispose()


def test_finalize_failed_job_updates_document_status():
    asyncio.run(_run_test_finalize_failed_job_updates_document_status())

