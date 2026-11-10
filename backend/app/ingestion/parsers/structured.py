import csv
import io
import json
from html.parser import HTMLParser
from typing import List
from app.core.exceptions import DocMindException
from app.ingestion.normalizer import normalize_text
from app.ingestion.parsers.base import ExtractedBlock, ParsedDocument
from app.models.enums import DocumentErrorCode


def _decode_bytes(data: bytes) -> str:
    for encoding in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def parse_csv(data: bytes) -> ParsedDocument:
    """Parses CSV spreadsheets into structured Markdown table blocks for accurate vector + tabular QA."""
    text = _decode_bytes(data)
    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader if any(cell.strip() for cell in r)]
    if not rows:
        raise DocMindException(
            status_code=422,
            code=DocumentErrorCode.NO_EXTRACTABLE_TEXT.value,
            title="Empty CSV",
            detail="CSV file contains no readable rows.",
        )

    header = [c.strip() or f"Col {i + 1}" for i, c in enumerate(rows[0])]
    data_rows = rows[1:] if len(rows) > 1 else []
    blocks: List[ExtractedBlock] = []
    total_chars = 0

    chunk_size = 30
    if not data_rows:
        md = " | ".join(header)
        blocks.append(ExtractedBlock(text=md, page_number=1, section_path="Header", char_count=len(md)))
        total_chars += len(md)
    else:
        for batch_idx, start in enumerate(range(0, len(data_rows), chunk_size), 1):
            slice_rows = data_rows[start : start + chunk_size]
            lines = [" | ".join(header), " | ".join(["---"] * len(header))]
            for r in slice_rows:
                padded = [(r[i].strip() if i < len(r) else "") for i in range(len(header))]
                lines.append(" | ".join(padded))
            md_block = "\n".join(lines)
            blocks.append(
                ExtractedBlock(
                    text=md_block,
                    page_number=batch_idx,
                    section_path=f"Rows {start + 1}-{start + len(slice_rows)}",
                    char_count=len(md_block),
                )
            )
            total_chars += len(md_block)

    return ParsedDocument(
        blocks=blocks,
        page_count=max(1, len(blocks)),
        total_char_count=total_chars,
        parser_name="csv-table",
        detected_language="en",
    )


def parse_json_doc(data: bytes) -> ParsedDocument:
    """Parses JSON documents into formatted, readable sections."""
    text = _decode_bytes(data)
    try:
        obj = json.loads(text)
    except json.JSONDecodeError as e:
        raise DocMindException(
            status_code=400,
            code=DocumentErrorCode.CORRUPT_FILE.value,
            title="Invalid JSON",
            detail=f"Malformed JSON file: {e}",
        )

    pretty = normalize_text(json.dumps(obj, indent=2, ensure_ascii=False))
    if not pretty.strip():
        raise DocMindException(
            status_code=422,
            code=DocumentErrorCode.NO_EXTRACTABLE_TEXT.value,
            title="Empty JSON",
            detail="JSON file contains no extractable text.",
        )

    lines = pretty.splitlines()
    blocks: List[ExtractedBlock] = []
    total_chars = 0
    step = 60
    for idx, i in enumerate(range(0, len(lines), step), 1):
        chunk_txt = "\n".join(lines[i : i + step])
        blocks.append(
            ExtractedBlock(
                text=chunk_txt,
                page_number=idx,
                section_path=f"JSON Part {idx}",
                char_count=len(chunk_txt),
            )
        )
        total_chars += len(chunk_txt)

    return ParsedDocument(
        blocks=blocks,
        page_count=max(1, len(blocks)),
        total_char_count=total_chars,
        parser_name="json-pretty",
        detected_language="en",
    )


class _VisibleHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self._skip_depth = 0
        self._sections: List[tuple[str, str, bool]] = []
        self._current_heading = "Overview"
        self._in_heading = False
        self._buf: List[str] = []

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        if t in ("script", "style", "noscript", "svg"):
            self._skip_depth += 1
        elif t in ("h1", "h2", "h3", "h4"):
            self._flush()
            self._in_heading = True
        elif t in ("p", "li", "div", "tr", "br"):
            self._buf.append("\n")

    def handle_endtag(self, tag):
        t = tag.lower()
        if t in ("script", "style", "noscript", "svg"):
            self._skip_depth = max(0, self._skip_depth - 1)
        elif t in ("h1", "h2", "h3", "h4"):
            heading = " ".join("".join(self._buf).split()).strip()
            self._buf.clear()
            self._in_heading = False
            if heading:
                self._current_heading = heading[:100]
                self._sections.append((heading, self._current_heading, True))
        elif t in ("p", "li", "section", "article"):
            self._flush()

    def handle_data(self, data):
        if self._skip_depth == 0:
            self._buf.append(data)

    def _flush(self):
        text = normalize_text("".join(self._buf)).strip()
        self._buf.clear()
        if text:
            self._sections.append((text, self._current_heading, False))

    def get_blocks(self) -> List[tuple[str, str, bool]]:
        self._flush()
        return self._sections


def parse_html(data: bytes) -> ParsedDocument:
    """Parses HTML pages, stripping scripts/styles and retaining semantic headings."""
    text = _decode_bytes(data)
    parser = _VisibleHTMLParser()
    parser.feed(text)
    parser.close()

    raw_blocks = parser.get_blocks()
    blocks: List[ExtractedBlock] = []
    total_chars = 0
    for content, section, is_heading in raw_blocks:
        blocks.append(
            ExtractedBlock(
                text=content,
                section_path=section,
                is_heading=is_heading,
                char_count=len(content),
            )
        )
        total_chars += len(content)

    if total_chars < 10:
        raise DocMindException(
            status_code=422,
            code=DocumentErrorCode.NO_EXTRACTABLE_TEXT.value,
            title="No Extractable Text",
            detail="HTML document contains no visible text.",
        )

    return ParsedDocument(
        blocks=blocks,
        page_count=max(1, len(blocks) // 5),
        total_char_count=total_chars,
        parser_name="html-semantic",
        detected_language="en",
    )

