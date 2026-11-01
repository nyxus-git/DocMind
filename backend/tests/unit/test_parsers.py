import fitz
import pytest
from app.ingestion.parsers.pdf import parse_pdf
from app.ingestion.parsers.txt import parse_markdown, parse_text


def test_parse_plain_text():
    raw_bytes = b"Paragraph 1: Executive overview.\n\nParagraph 2: Financial results."
    parsed = parse_text(raw_bytes)

    assert parsed.page_count >= 1
    assert len(parsed.blocks) == 2
    assert "Executive overview" in parsed.blocks[0].text
    assert parsed.parser_name == "plain-text"


def test_parse_markdown_headings():
    raw_md = b"# Title\n\nOverview content.\n\n## Section A\n\nDetailed analysis of Section A."
    parsed = parse_markdown(raw_md)

    assert len(parsed.blocks) >= 2
    headings = [b for b in parsed.blocks if b.is_heading]
    assert len(headings) >= 1
    assert parsed.parser_name == "markdown-ast"


def test_parse_synthetic_pdf():
    # Generate a valid PDF in-memory with PyMuPDF
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), "DocMind Synthetic Compliance Report Page 1\nRevenue increased by 15 percent.")
    pdf_bytes = doc.tobytes()
    doc.close()

    parsed = parse_pdf(pdf_bytes)
    assert parsed.page_count == 1
    assert len(parsed.blocks) == 1
    assert "Revenue increased" in parsed.blocks[0].text
    assert parsed.parser_name == "pymupdf"
