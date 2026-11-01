from typing import Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class CursorPage(BaseModel, Generic[T]):
    items: List[T]
    next_cursor: Optional[str] = None
    has_more: bool = False
    total_count: Optional[int] = None


class MessageResponse(BaseModel):
    message: str
    success: bool = True
