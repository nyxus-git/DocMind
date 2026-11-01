from typing import Any, Dict, List, Optional
from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ProblemDetail(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    code: str
    detail: str
    request_id: Optional[str] = None
    field_errors: Optional[List[Dict[str, Any]]] = None


class DocMindException(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        title: str,
        detail: str,
        field_errors: Optional[List[Dict[str, Any]]] = None,
    ):
        self.status_code = status_code
        self.code = code
        self.title = title
        self.detail = detail
        self.field_errors = field_errors
        super().__init__(detail)


class QuotaExceededException(DocMindException):
    def __init__(self, detail: str, code: str = "QUOTA_EXCEEDED"):
        super().__init__(
            status_code=429,
            code=code,
            title="Quota Exceeded",
            detail=detail
        )


class EntityNotFoundException(DocMindException):
    def __init__(self, entity: str, entity_id: Any):
        super().__init__(
            status_code=404,
            code=f"{entity.upper()}_NOT_FOUND",
            title="Resource Not Found",
            detail=f"{entity} with ID {entity_id} does not exist or you lack permission to access it."
        )


class CrossTenantAccessException(DocMindException):
    def __init__(self):
        super().__init__(
            status_code=403,
            code="CROSS_TENANT_ACCESS_DENIED",
            title="Access Denied",
            detail="You are not authorized to access resources outside your active workspace."
        )


class ServiceDegradedException(DocMindException):
    def __init__(self, detail: str = "AI features are temporarily disabled by policy."):
        super().__init__(
            status_code=503,
            code="SERVICE_DEGRADED",
            title="Service Unavailable",
            detail=detail
        )


async def docmind_exception_handler(request: Request, exc: Any) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    problem = ProblemDetail(
        type=f"https://docmind.ai/errors/{exc.code.lower()}",
        title=exc.title,
        status=exc.status_code,
        code=exc.code,
        detail=exc.detail,
        request_id=request_id,
        field_errors=exc.field_errors,
    )
    return JSONResponse(status_code=exc.status_code, content=problem.model_dump())
