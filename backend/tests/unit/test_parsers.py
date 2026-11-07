import io
import fitz
import pytest
from docx import Document as DocxDocument
from app.ingestion.ocr import get_available_ocr_languages, is_ocr_available, ocr_image_bytes
from app.ingestion.parsers.docx import parse_docx
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
    assert len(parsed.blocks) >= 1
    assert "Revenue increased" in parsed.blocks[0].text
    assert "pymupdf" in parsed.parser_name


def test_parse_docx_with_labeled_table():
    # Generate in-memory DOCX with heading and labeled table
    doc = DocxDocument()
    doc.add_heading("Vendor Service Level Agreement", level=1)
    doc.add_paragraph("This document outlines contract terms and commitments.")

    table = doc.add_table(rows=3, cols=2)
    # Header row
    table.rows[0].cells[0].text = "Service Metric"
    table.rows[0].cells[1].text = "Guaranteed SLA"
    # Row 2
    table.rows[1].cells[0].text = "Platform Uptime"
    table.rows[1].cells[1].text = "99.95%"
    # Row 3
    table.rows[2].cells[0].text = "Support Response"
    table.rows[2].cells[1].text = "< 15 minutes"

    buf = io.BytesIO()
    doc.save(buf)
    docx_bytes = buf.getvalue()

    parsed = parse_docx(docx_bytes)
    assert parsed.total_char_count > 50
    assert len(parsed.blocks) >= 2

    table_blocks = [b for b in parsed.blocks if "Table" in (b.section_path or "")]
    assert len(table_blocks) == 1
    table_text = table_blocks[0].text

    # Verify labeled row formatting per PRD Section 13
    assert "Table 1 / Row 2:" in table_text
    assert "Service Metric = Platform Uptime" in table_text
    assert "Guaranteed SLA = 99.95%" in table_text


def test_ocr_availability_and_extraction():
    available = is_ocr_available()
    langs = get_available_ocr_languages()
    # On this environment Tesseract is installed with afr/osd
    assert available is True
    assert len(langs) > 0

    # Test direct OCR on rendered image
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), "CONFIDENTIAL AUDIT EVIDENCE")
    pix = page.get_pixmap(dpi=150)
    png_bytes = pix.tobytes("png")
    doc.close()

    ocr_result = ocr_image_bytes(png_bytes, timeout_seconds=10)
    assert ocr_result is not None
    assert "CONFIDENTIAL" in ocr_result.upper() or "AUDIT" in ocr_result.upper()
