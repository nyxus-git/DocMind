from typing import Any, Dict, List, Optional
from app.ingestion.parsers.base import ExtractedBlock, ParsedDocument


class StructureAwareChunker:
    def __init__(
        self,
        min_chunk_chars: int = 500,
        max_chunk_chars: int = 3500,
        overlap_chars: int = 300
    ):
        self.min_chunk_chars = min_chunk_chars
        self.max_chunk_chars = max_chunk_chars
        self.overlap_chars = overlap_chars

    def chunk_document(self, parsed: ParsedDocument) -> List[Dict[str, Any]]:
        """
        Chunks parsed document along structural boundaries (headings, paragraphs, pages)
        preserving citation metadata (page_start, page_end, section_path).
        """
        chunks: List[Dict[str, Any]] = []
        current_text_parts: List[str] = []
        current_length = 0
        current_page_start: Optional[int] = None
        current_page_end: Optional[int] = None
        current_section = "Document Content"

        for block in parsed.blocks:
            if current_page_start is None and block.page_number:
                current_page_start = block.page_number
            if block.page_number:
                current_page_end = block.page_number
            if block.section_path:
                current_section = block.section_path

            # If block itself is huge, slice it
            block_text = block.text
            if len(block_text) > self.max_chunk_chars:
                # Flush current accumulator first
                if current_text_parts:
                    chunk_text = "\n\n".join(current_text_parts)
                    chunks.append({
                        "chunk_index": len(chunks),
                        "content": chunk_text,
                        "page_start": current_page_start,
                        "page_end": current_page_end,
                        "section_path": current_section,
                        "token_count": max(1, len(chunk_text) // 4),
                        "metadata": {"char_count": len(chunk_text)}
                    })
                    current_text_parts = []
                    current_length = 0

                # Slice oversized block
                for i in range(0, len(block_text), self.max_chunk_chars - self.overlap_chars):
                    sub_text = block_text[i:i + self.max_chunk_chars]
                    chunks.append({
                        "chunk_index": len(chunks),
                        "content": sub_text,
                        "page_start": block.page_number,
                        "page_end": block.page_number,
                        "section_path": block.section_path or current_section,
                        "token_count": max(1, len(sub_text) // 4),
                        "metadata": {"char_count": len(sub_text)}
                    })
                current_page_start = None
                continue

            # Check if adding block exceeds max_chunk_chars
            if current_length + len(block_text) > self.max_chunk_chars:
                chunk_text = "\n\n".join(current_text_parts)
                chunks.append({
                    "chunk_index": len(chunks),
                    "content": chunk_text,
                    "page_start": current_page_start,
                    "page_end": current_page_end,
                    "section_path": current_section,
                    "token_count": max(1, len(chunk_text) // 4),
                    "metadata": {"char_count": len(chunk_text)}
                })
                # Retain overlap from last part
                last_part = current_text_parts[-1] if current_text_parts else ""
                overlap_text = last_part[-self.overlap_chars:] if len(last_part) > self.overlap_chars else last_part
                current_text_parts = [overlap_text, block_text] if overlap_text else [block_text]
                current_length = sum(len(p) for p in current_text_parts)
                current_page_start = block.page_number
            else:
                current_text_parts.append(block_text)
                current_length += len(block_text)

        # Flush any remaining buffer
        if current_text_parts:
            chunk_text = "\n\n".join(current_text_parts)
            if chunk_text.strip():
                chunks.append({
                    "chunk_index": len(chunks),
                    "content": chunk_text,
                    "page_start": current_page_start,
                    "page_end": current_page_end,
                    "section_path": current_section,
                    "token_count": max(1, len(chunk_text) // 4),
                    "metadata": {"char_count": len(chunk_text)}
                })

        return chunks
