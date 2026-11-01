from typing import List
from app.ingestion.normalizer import normalize_text
from app.ingestion.parsers.base import ExtractedBlock, ParsedDocument


def parse_text(data: bytes) -> ParsedDocument:
    # Try UTF-8 with BOM handling, fallback to latin-1
    for encoding in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = data.decode("utf-8", errors="replace")

    normalized = normalize_text(text)
    paragraphs = [p.strip() for p in normalized.split("\n\n") if p.strip()]

    blocks: List[ExtractedBlock] = []
    total_chars = 0

    for idx, p in enumerate(paragraphs, 1):
        block = ExtractedBlock(
            text=p,
            section_path=f"Paragraph {idx}",
            char_count=len(p)
        )
        blocks.append(block)
        total_chars += len(p)

    return ParsedDocument(
        blocks=blocks,
        page_count=max(1, len(paragraphs) // 4),
        total_char_count=total_chars,
        parser_name="plain-text",
        detected_language="en"
    )


def parse_markdown(data: bytes) -> ParsedDocument:
    for encoding in ["utf-8-sig", "utf-8", "latin-1"]:
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = data.decode("utf-8", errors="replace")

    normalized = normalize_text(text)
    lines = normalized.split("\n")

    blocks: List[ExtractedBlock] = []
    current_section = "Overview"
    current_buffer: List[str] = []
    total_chars = 0

    def flush_buffer():
        nonlocal total_chars
        if current_buffer:
            content = "\n".join(current_buffer).strip()
            if content:
                blocks.append(ExtractedBlock(
                    text=content,
                    section_path=current_section,
                    char_count=len(content)
                ))
                total_chars += len(content)
            current_buffer.clear()

    for line in lines:
        if line.startswith("#"):
            flush_buffer()
            current_section = line.lstrip("#").strip()[:100]
            blocks.append(ExtractedBlock(
                text=line,
                section_path=current_section,
                is_heading=True,
                char_count=len(line)
            ))
            total_chars += len(line)
        else:
            current_buffer.append(line)

    flush_buffer()

    return ParsedDocument(
        blocks=blocks,
        page_count=max(1, len(blocks) // 4),
        total_char_count=total_chars,
        parser_name="markdown-ast",
        detected_language="en"
    )
