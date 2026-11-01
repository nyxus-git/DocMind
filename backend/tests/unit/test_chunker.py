from app.ingestion.chunker import StructureAwareChunker
from app.ingestion.parsers.base import ExtractedBlock, ParsedDocument


def test_structure_aware_chunker_preserves_metadata():
    blocks = [
        ExtractedBlock(text="Section 1: Executive Overview. All operations met target metrics.", page_number=1, section_path="Executive Overview"),
        ExtractedBlock(text="Section 2: Financial Results. Revenue increased by 24% year-over-year.", page_number=2, section_path="Financial Results"),
        ExtractedBlock(text="Section 3: Risk Factors. Currency fluctuations remain an operational risk.", page_number=3, section_path="Risk Factors"),
    ]
    parsed = ParsedDocument(
        blocks=blocks,
        page_count=3,
        total_char_count=sum(len(b.text) for b in blocks),
        parser_name="test-parser"
    )

    chunker = StructureAwareChunker(min_chunk_chars=50, max_chunk_chars=500, overlap_chars=50)
    chunks = chunker.chunk_document(parsed)

    assert len(chunks) >= 1
    for idx, c in enumerate(chunks):
        assert c["chunk_index"] == idx
        assert "content" in c
        assert c["token_count"] > 0
        assert c["page_start"] is not None
        assert c["section_path"] is not None
