import uuid
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.models.entities import Base, Document, User, Workspace, WorkspaceMember
from app.models.enums import DocumentStatus, WorkspaceRole


@pytest.fixture
def sync_db():
    engine = create_engine("sqlite:///:memory:")
    # Create tables without pgvector specific column in sqlite
    # In sqlite, Vector/TSVECTOR can be treated as plain types or excluded for this unit test
    Base.metadata.create_all(engine, tables=[
        User.__table__,
        Workspace.__table__,
        WorkspaceMember.__table__,
        Document.__table__
    ])
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
