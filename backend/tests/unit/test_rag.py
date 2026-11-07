import asyncio
import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.adapters.ai.base import EmbeddingProvider, LLMProvider, LLMResult
from app.models.entities import (
    Base,
    Conversation,
    Document,
    DocumentChunk,
    Message,
    MessageCitation,
    UsageEvent,
    User,
    Workspace,
    WorkspaceMember,
)
from app.models.enums import DocumentStatus, WorkspaceRole
from app.repositories.chunk import ChunkRepository
from app.services.ai_chat import ChatService


class MockEmbeddingProvider(EmbeddingProvider):
    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [[0.1] * 768 for _ in texts]

    async def embed_query(self, text: str) -> List[float]:
        return [0.1] * 768


class MockLLMProvider(LLMProvider):
    def __init__(self, return_json: Optional[Dict[str, Any]] = None):
        self.return_json = return_json or {
            "answer": "The contract enforces liability limits capped at 12 months of fees [S1]. An ungrounded claim was also made [S99].",
            "insufficient_evidence": False,
            "citations": [
                {"source_id": "S1", "claim": "Liability limits capped at 12 months of fees."}
            ],
            "suggested_followups": ["What is the notice period?"]
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
            text="Mock answer",
            parsed_json=self.return_json,
            input_tokens=150,
            output_tokens=45,
            model="gemini-3.8-flash",
            latency_ms=120
        )


async def _run_test_rag_pipeline():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[
            User.__table__,
            Workspace.__table__,
            WorkspaceMember.__table__,
            Document.__table__,
            DocumentChunk.__table__,
            Conversation.__table__,
            Message.__table__,
            MessageCitation.__table__,
            UsageEvent.__table__
        ])

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        user_id = uuid.uuid4()
        ws_id = uuid.uuid4()
        doc_id = uuid.uuid4()
        conv_id = uuid.uuid4()

        user = User(id=user_id, email="auditor@docmind.ai", password_hash="hash")
        ws = Workspace(id=ws_id, name="Compliance WS", slug="compliance-ws", created_by=user_id)
        member = WorkspaceMember(workspace_id=ws_id, user_id=user_id, role=WorkspaceRole.OWNER.value)
        doc = Document(
            id=doc_id,
            workspace_id=ws_id,
            uploaded_by=user_id,
            filename="Master_Service_Agreement.pdf",
            mime_type="application/pdf",
            size_bytes=50000,
            checksum_sha256="abc" * 21 + "a",
            object_key=f"raw/{ws_id}/{doc_id}.bin",
            status=DocumentStatus.READY.value
        )
        conv = Conversation(
            id=conv_id,
            workspace_id=ws_id,
            created_by=user_id,
            title="SLA and Liability Review",
            selected_doc_ids=[str(doc_id)]
        )

        session.add_all([user, ws, member, doc, conv])
        await session.commit()

        # Insert test chunks
        chunk_repo = ChunkRepository(session)
        chunks = [
            {
                "chunk_index": 0,
                "content": "Section 12. Limitation of Liability. The total aggregate liability shall not exceed fees paid in the prior twelve (12) months.",
                "page_start": 14,
                "page_end": 14,
                "section_path": "Section 12 Limitation of Liability",
                "token_count": 25,
                "metadata": {}
            },
            {
                "chunk_index": 1,
                "content": "Section 14. Confidentiality and NDA guarantees. Data must be purged within 30 days upon termination.",
                "page_start": 18,
                "page_end": 18,
                "section_path": "Section 14 Confidentiality",
                "token_count": 22,
                "metadata": {}
            }
        ]
        await chunk_repo.bulk_insert_chunks(ws_id, doc_id, chunks)
        await session.commit()

        # 1. Test hybrid search retrieval
        retrieved = await chunk_repo.hybrid_search(
            workspace_id=ws_id,
            document_ids=[doc_id],
            query_embedding=[0.1] * 768,
            query_text="liability limitation fees",
            top_k=5
        )
        assert len(retrieved) >= 1
        top_chunk, top_doc, score = retrieved[0]
        assert top_doc.filename == "Master_Service_Agreement.pdf"
        assert "Limitation of Liability" in top_chunk.content

        # 2. Test RAG Chat Service with citation sanitization
        chat_service = ChatService(
            db=session,
            llm=MockLLMProvider(),
            embedding=MockEmbeddingProvider()
        )

        response = await chat_service.send_message(
            workspace_id=ws_id,
            user_id=user_id,
            conversation_id=conv_id,
            content="What is the limitation of liability in the agreement?",
            document_ids=[doc_id]
        )

        assert response.role == "assistant"
        assert response.insufficient_evidence is False
        assert len(response.citations) == 1

        citation = response.citations[0]
        assert citation.source_label == "S1"
        assert citation.filename == "Master_Service_Agreement.pdf"
        assert citation.page_start == 14

        # Crucial PRD Section 16 assertion:
        # [S99] was hallucinated by LLM but NOT present in evidence bundle.
        # It must be stripped from response content!
        assert "[S1]" in response.content
        assert "[S99]" not in response.content


def test_rag_pipeline_and_citation_grounding():
    asyncio.run(_run_test_rag_pipeline())
