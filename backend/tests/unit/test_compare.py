import asyncio
import uuid
from typing import Any, Dict, List, Optional
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from app.adapters.ai.base import EmbeddingProvider, LLMProvider, LLMResult
from app.core.exceptions import DocMindException
from app.models.entities import (
    Base,
    Document,
    DocumentChunk,
    UsageEvent,
    User,
    Workspace,
    WorkspaceMember,
)
from app.models.enums import DocumentStatus, WorkspaceRole
from app.schemas.intelligence import CompareDocumentsRequest
from app.services.ai_intelligence import IntelligenceService


class MockEmbeddingProvider(EmbeddingProvider):
    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [[0.05] * 768 for _ in texts]

    async def embed_query(self, text: str) -> List[float]:
        return [0.05] * 768


class MockCompareLLMProvider(LLMProvider):
    def __init__(self, custom_json: Optional[Dict[str, Any]] = None):
        self.custom_json = custom_json or {
            "narrative_summary": "Comparative synthesis shows key divergence in liability exposure and SLA downtime remedies.",
            "matrix": [
                {
                    "attribute": "Liability Cap Exposure",
                    "per_document_values": {
                        "Vendor_Agreement_A.pdf": "Capped at 12 months fees paid",
                        "Vendor_Agreement_B.pdf": "Capped at 6 months fees; uncapped for IP breaches"
                    },
                    "differences_summary": "Agreement A establishes uniform fee caps, while Agreement B exempts IP claims.",
                    "source_labels": ["S1", "S2", "S99"]  # S99 is a simulated hallucination
                },
                {
                    "attribute": "Termination for Convenience",
                    "per_document_values": {
                        "Vendor_Agreement_A.pdf": "30 days prior written notice",
                        "Vendor_Agreement_B.pdf": "90 days prior written notice"
                    },
                    "differences_summary": "Agreement B enforces three times longer notice before early exit.",
                    "source_labels": ["S1"]
                }
            ],
            "limitations": "Direct comparison is scoped to core commercial clauses."
        }

    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        response_schema: Optional[Dict[str, Any]] = None,
        max_tokens: int = 1500,
        temperature: float = 0.2
    ) -> LLMResult:
        return LLMResult(
            text="Mock comparative response",
            parsed_json=self.custom_json,
            input_tokens=220,
            output_tokens=90,
            model="gemini-3.8-flash",
            latency_ms=85
        )


async def _run_test_compare_matrix_engine():
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
        ws_id = uuid.uuid4()
        other_ws_id = uuid.uuid4()

        doc_a_id = uuid.uuid4()
        doc_b_id = uuid.uuid4()
        doc_c_id = uuid.uuid4()
        foreign_doc_id = uuid.uuid4()

        user = User(id=user_id, email="auditor@docmind.ai", password_hash="hash")
        ws = Workspace(id=ws_id, name="Legal Audit WS", slug="legal-audit-ws", created_by=user_id)
        other_ws = Workspace(id=other_ws_id, name="Other WS", slug="other-ws", created_by=user_id)
        member = WorkspaceMember(workspace_id=ws_id, user_id=user_id, role=WorkspaceRole.OWNER.value)

        # Document A: READY with 2 chunks
        doc_a = Document(
            id=doc_a_id,
            workspace_id=ws_id,
            uploaded_by=user_id,
            filename="Vendor_Agreement_A.pdf",
            mime_type="application/pdf",
            size_bytes=30000,
            checksum_sha256="aaa" * 21 + "a",
            object_key=f"raw/{ws_id}/{doc_a_id}.bin",
            status=DocumentStatus.READY.value
        )
        chunk_a1 = DocumentChunk(
            id=uuid.uuid4(),
            workspace_id=ws_id,
            document_id=doc_a_id,
            chunk_index=0,
            content="Section 8.1 Liability: In no event shall either party's aggregate liability exceed the total fees paid in the twelve (12) months preceding the incident.",
            page_start=1,
            page_end=1,
            section_path="Article 8 - Liability"
        )
        chunk_a2 = DocumentChunk(
            id=uuid.uuid4(),
            workspace_id=ws_id,
            document_id=doc_a_id,
            chunk_index=1,
            content="Section 10.2 Termination: Either party may terminate for convenience upon thirty (30) days prior written notice.",
            page_start=2,
            page_end=2,
            section_path="Article 10 - Termination"
        )

        # Document B: READY with 1 chunk
        doc_b = Document(
            id=doc_b_id,
            workspace_id=ws_id,
            uploaded_by=user_id,
            filename="Vendor_Agreement_B.pdf",
            mime_type="application/pdf",
            size_bytes=35000,
            checksum_sha256="bbb" * 21 + "b",
            object_key=f"raw/{ws_id}/{doc_b_id}.bin",
            status=DocumentStatus.READY.value
        )
        chunk_b1 = DocumentChunk(
            id=uuid.uuid4(),
            workspace_id=ws_id,
            document_id=doc_b_id,
            chunk_index=0,
            content="Section 12. Limitation: Liability is capped at six (6) months of charges. Claims regarding intellectual property rights infringement remain uncapped.",
            page_start=1,
            page_end=1,
            section_path="Article 12 - Indemnification"
        )

        # Document C: PROCESSING (not ready)
        doc_c = Document(
            id=doc_c_id,
            workspace_id=ws_id,
            uploaded_by=user_id,
            filename="Vendor_Agreement_C.pdf",
            mime_type="application/pdf",
            size_bytes=40000,
            checksum_sha256="ccc" * 21 + "c",
            object_key=f"raw/{ws_id}/{doc_c_id}.bin",
            status=DocumentStatus.PROCESSING.value
        )

        # Foreign Document: in other workspace
        foreign_doc = Document(
            id=foreign_doc_id,
            workspace_id=other_ws_id,
            uploaded_by=user_id,
            filename="Confidential_Other_WS.pdf",
            mime_type="application/pdf",
            size_bytes=20000,
            checksum_sha256="ddd" * 21 + "d",
            object_key=f"raw/{other_ws_id}/{foreign_doc_id}.bin",
            status=DocumentStatus.READY.value
        )

        session.add_all([
            user, ws, other_ws, member,
            doc_a, chunk_a1, chunk_a2,
            doc_b, chunk_b1,
            doc_c, foreign_doc
        ])
        await session.commit()

        service = IntelligenceService(
            db=session,
            llm=MockCompareLLMProvider(),
            embedder=MockEmbeddingProvider()
        )

        # Test 1: Reject less than 2 documents
        with pytest.raises(DocMindException) as exc1:
            await service.compare_documents(
                workspace_id=ws_id,
                document_ids=[doc_a_id],
                user_id=user_id
            )
        assert exc1.value.status_code == 400
        assert exc1.value.code == "INVALID_DOCUMENT_COUNT"

        # Test 2: Reject more than 5 documents
        dummy_ids = [uuid.uuid4() for _ in range(6)]
        with pytest.raises(DocMindException) as exc2:
            await service.compare_documents(
                workspace_id=ws_id,
                document_ids=dummy_ids,
                user_id=user_id
            )
        assert exc2.value.status_code == 400
        assert exc2.value.code == "INVALID_DOCUMENT_COUNT"

        # Test 3: Reject non-existent / foreign workspace document
        with pytest.raises(DocMindException) as exc3:
            await service.compare_documents(
                workspace_id=ws_id,
                document_ids=[doc_a_id, foreign_doc_id],
                user_id=user_id
            )
        assert exc3.value.status_code == 404
        assert exc3.value.code == "DOCUMENTS_NOT_FOUND"

        # Test 4: Reject unready document (Document C is PROCESSING)
        with pytest.raises(DocMindException) as exc4:
            await service.compare_documents(
                workspace_id=ws_id,
                document_ids=[doc_a_id, doc_c_id],
                user_id=user_id
            )
        assert exc4.value.status_code == 400
        assert exc4.value.code == "DOCUMENTS_NOT_READY"

        # Test 5: Successful comparison with 2 READY documents
        resp = await service.compare_documents(
            workspace_id=ws_id,
            document_ids=[doc_a_id, doc_b_id],
            focus_topic="Liability Caps & Termination",
            user_id=user_id
        )

        assert resp.document_ids == [doc_a_id, doc_b_id]
        assert len(resp.matrix) == 2
        assert resp.matrix[0].attribute == "Liability Cap Exposure"
        assert "Vendor_Agreement_A.pdf" in resp.matrix[0].per_document_values
        assert "Vendor_Agreement_B.pdf" in resp.matrix[0].per_document_values

        # Verify hallucinated tag S99 was filtered out from source_labels
        assert "S99" not in resp.matrix[0].source_labels
        assert "S1" in resp.matrix[0].source_labels
        assert "S2" in resp.matrix[0].source_labels

        # Verify citations are populated and grounded
        assert len(resp.citations) >= 2
        source_labels = {c.source_label for c in resp.citations}
        assert "S1" in source_labels
        assert "S2" in source_labels

        # Verify usage event was logged
        events_res = await session.execute(
            UsageEvent.__table__.select().where(
                UsageEvent.workspace_id == ws_id,
                UsageEvent.event_type == "comparison"
            )
        )
        events = list(events_res.all())
        assert len(events) >= 1
        assert events[0].units == 310  # 220 in + 90 out

        # Test 6: Extraction preset test
        extract_resp = await service.extract_preset(
            workspace_id=ws_id,
            document_id=doc_a_id,
            preset_id="obligations",
            user_id=user_id
        )
        assert extract_resp.document_id == doc_a_id
        assert extract_resp.preset_id == "obligations"
        assert len(extract_resp.citations) > 0


def test_compare_matrix_engine():
    asyncio.run(_run_test_compare_matrix_engine())
