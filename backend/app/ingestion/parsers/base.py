from typing import List, Optional
from pydantic import BaseModel, Field


class ExtractedBlock(BaseModel):
    text: str
    page_number: Optional[int] = None
    section_path: Optional[str] = None
    is_heading: bool = False
    char_count: int = 0


class ParsedDocument(BaseModel):
    blocks: List[ExtractedBlock]
    page_count: int = 1
    total_char_count: int = 0
    parser_name: str
    detected_language: str = "en"
