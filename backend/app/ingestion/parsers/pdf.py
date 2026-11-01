import io
from typing import List
import fitz  # PyMuPDF
from app.core.config import settings
from app.core.exceptions import DocMindException
from app.ingestion.normalizer import normalize_text
from app.ingestion.parsers.base import ExtractedBlock, ParsedDocument
from app.models.enums import DocumentErrorCode


def parse_pdf(data: bytes) -> ParsedDocument:
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as e:
        raise DocMindException(
            status_code=400,
            code=DocumentErrorCode.CORRUPT_FILE.value,
            title="Corrupt PDF Document",
            detail=f"Failed to open PDF document: {str(e)}"
        )

    if doc.is_encrypted:
        doc.close()
        raise DocMindException(
            status_code=400,
            code=DocumentErrorCode.PASSWORD_PROTECTED.value,
            title="Password Protected PDF",
            detail="Password-protected PDFs cannot be processed in P0."
        )

    page_count = len(doc)
    if page_count > settings.MAX_PAGES:
        doc.close()
        raise DocMindException(
            status_code=400,
            code=DocumentErrorCode.PAGE_LIMIT_EXCEEDED.value,
            title="Page Limit Exceeded",
            detail=f"PDF has {page_count} pages, which exceeds the maximum limit of {settings.MAX_PAGES} pages."
        )

    blocks: List[ExtractedBlock] = []
    total_chars = 0

    for page_num in range(1, page_count + 1):
        page = doc[page_num - 1]
        text_page = page.get_text("text")
        cleaned_text = normalize_text(str(text_page))

        if cleaned_text:
            block = ExtractedBlock(
                text=cleaned_text,
                page_number=page_num,
                section_path=f"Page {page_num}",
                char_count=len(cleaned_text)
            )
            blocks.append(block)
            total_chars += len(cleaned_text)

    doc.close()

    if total_chars < 50:
        raise DocMindException(
            status_code=422,
            code=DocumentErrorCode.NO_EXTRACTABLE_TEXT.value,
            title="No Extractable Text",
            detail="The document contains insufficient digital text. Scanned or image-only documents without OCR are not supported."
        )

    return ParsedDocument(
        blocks=blocks,
        page_count=page_count,
        total_char_count=total_chars,
        parser_name="pymupdf",
        detected_language="en"
    )
