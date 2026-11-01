from typing import Any, Dict, List, Optional, Protocol
from pydantic import BaseModel


class LLMResult(BaseModel):
    text: str
    parsed_json: Optional[Dict[str, Any]] = None
    input_tokens: int = 0
    output_tokens: int = 0
    model: str = "gemini-3.8-flash"
    latency_ms: int = 0


class LLMProvider(Protocol):
    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        response_schema: Optional[Dict[str, Any]] = None,
        max_tokens: int = 1500,
        temperature: float = 0.2
    ) -> LLMResult:
        ...


class EmbeddingProvider(Protocol):
    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        ...

    async def embed_query(self, text: str) -> List[float]:
        ...
