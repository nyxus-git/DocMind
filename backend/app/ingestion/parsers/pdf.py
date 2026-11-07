import logging
from typing import List
import fitz  # PyMuPDF
from app.core.config import settings
from app.core.exceptions import DocMindException
from app.ingestion.normalizer import normalize_text
from app.ingestion.ocr import is_ocr_available, ocr_image_bytes
from app.ingestion.parsers.base import ExtractedBlock, ParsedDocument
from app.models.enums import DocumentErrorCode

logger = logging.getLogger("docmind.ingestion.pdf")

# Minimum non-whitespace characters to consider a page having valid digital text
DIGITAL_TEXT_THRESHOLD = 30


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
    pages_needing_ocr = 0
    ocr_successful_pages = 0

    for page_num in range(1, page_count + 1):
        page = doc[page_num - 1]

        # 1. Digital text extraction
        text_page = page.get_text("text")
        cleaned_text = normalize_text(str(text_page))
        non_space_count = len(cleaned_text.replace(" ", "").replace("\n", ""))

        page_blocks: List[ExtractedBlock] = []

        # 2. Table extraction (PyMuPDF find_tables)
        try:
            tab_finder = page.find_tables()
            if tab_finder and tab_finder.tables:
                for t_idx, tab in enumerate(tab_finder.tables, 1):
                    raw_rows = tab.extract()
                    if raw_rows:
                        table_lines = []
                        header = [c.strip() if c else f"Col {i+1}" for i, c in enumerate(raw_rows[0])]
                        table_lines.append(" | ".join(header))
                        table_lines.append(" | ".join(["---"] * len(header)))
                        for row in raw_rows[1:]:
                            row_vals = [c.strip() if c else "" for c in row]
                            table_lines.append(" | ".join(row_vals))

                        table_text = "\n".join(table_lines)
                        page_blocks.append(
                            ExtractedBlock(
                                text=table_text,
                                page_number=page_num,
                                section_path=f"Page {page_num} > Table {t_idx}",
                                is_heading=False,
                                char_count=len(table_text)
                            )
                        )
                        total_chars += len(table_text)
        except Exception as te:
            logger.debug(f"Table detection skipped for page {page_num}: {te}")

        # 3. Add digital text if sufficient
        if non_space_count >= DIGITAL_TEXT_THRESHOLD:
            page_blocks.append(
                ExtractedBlock(
                    text=cleaned_text,
                    page_number=page_num,
                    section_path=f"Page {page_num}",
                    is_heading=False,
                    char_count=len(cleaned_text)
                )
            )
            total_chars += len(cleaned_text)
        else:
            # 4. OCR Fallback for scanned or low-text pages per PRD Section 13
            pages_needing_ocr += 1
            logger.info(f"Page {page_num} has only {non_space_count} chars; triggering selective OCR fallback...")

            try:
                # Render page at 150 DPI per small VPS budget guidelines
                pix = page.get_pixmap(dpi=150)
                png_bytes = pix.tobytes("png")
                ocr_text = ocr_image_bytes(png_bytes, preferred_lang="eng", timeout_seconds=15)

                if ocr_text and len(ocr_text.strip()) > 10:
                    page_blocks.append(
                        ExtractedBlock(
                            text=ocr_text,
                            page_number=page_num,
                            section_path=f"Page {page_num} (OCR)",
                            is_heading=False,
                            char_count=len(ocr_text)
                        )
                    )
                    total_chars += len(ocr_text)
                    ocr_successful_pages += 1
                elif cleaned_text:
                    # Retain whatever tiny digital text was found
                    page_blocks.append(
                        ExtractedBlock(
                            text=cleaned_text,
                            page_number=page_num,
                            section_path=f"Page {page_num}",
                            is_heading=False,
                            char_count=len(cleaned_text)
                        )
                    )
                    total_chars += len(cleaned_text)
            except Exception as ocre:
                logger.warning(f"OCR render failed on page {page_num}: {ocre}")

        blocks.extend(page_blocks)

    doc.close()

    if total_chars < 50:
        if pages_needing_ocr > 0 and not is_ocr_available():
            raise DocMindException(
                status_code=422,
                code=DocumentErrorCode.OCR_UNAVAILABLE.value,
                title="OCR Engine Unavailable",
                detail="The document requires OCR for scanned pages, but the OCR engine or required language packs are currently unavailable."
            )

        raise DocMindException(
            status_code=422,
            code=DocumentErrorCode.NO_EXTRACTABLE_TEXT.value,
            title="No Extractable Text",
            detail="The document contains insufficient digital text and OCR produced no readable content."
        )

    return ParsedDocument(
        blocks=blocks,
        page_count=page_count,
        total_char_count=total_chars,
        parser_name="pymupdf-ocr-hybrid",
        detected_language="en"
    )
