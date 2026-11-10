import logging
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.v1.admin import router as admin_router
from app.api.v1.auth import router as auth_router
from app.api.v1.chat import router as chat_router
from app.api.v1.compare import router as compare_router
from app.api.v1.documents import mock_storage_router, router as documents_router
from app.api.v1.health import router as health_router
from app.api.v1.search import router as search_router
from app.api.v1.usage import router as usage_router
from app.api.v1.users import router as users_router
from app.api.v1.workspaces import router as workspaces_router
from app.core.config import settings
from app.core.exceptions import DocMindException, docmind_exception_handler
from app.core.logging import RequestLoggingMiddleware, setup_logging
from app.core.rate_limit import RateLimitMiddleware
from app.db.migrate import run_migrations

logger = logging.getLogger("docmind.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    try:
        await run_migrations()
    except Exception as e:
        logger.warning(f"Startup schema migration check deferred: {e}")
    yield


app = FastAPI(
    title="DocMind API",
    version="1.0.0",
    description="Enterprise Document Intelligence & Grounded RAG Workspace",
    lifespan=lifespan
)

# Exception handlers (RFC 7807 problem details)
app.add_exception_handler(DocMindException, docmind_exception_handler)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    origin = request.headers.get("Origin") or "*"
    headers = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }
    field_errors = []
    messages = []
    for err in exc.errors():
        loc = ".".join(str(item) for item in err.get("loc", []) if item != "body")
        msg = err.get("msg", "Invalid value")
        field_errors.append({"field": loc, "issue": msg})
        messages.append(f"{loc}: {msg}" if loc else msg)

    return JSONResponse(
        status_code=422,
        content={
            "type": "https://docmind.ai/errors/validation_error",
            "title": "Validation Error",
            "status": 422,
            "code": "VALIDATION_ERROR",
            "detail": "; ".join(messages) if messages else "Invalid request data.",
            "field_errors": field_errors,
        },
        headers=headers,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"Unhandled 500 Exception on {request.method} {request.url.path}: {exc}\n{traceback.format_exc()}"
    )
    request_id = getattr(request.state, "request_id", None)
    origin = request.headers.get("Origin") or "*"
    headers = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }
    return JSONResponse(
        status_code=500,
        content={
            "type": "https://docmind.ai/errors/internal_server_error",
            "title": "Internal Server Error",
            "status": 500,
            "code": "INTERNAL_SERVER_ERROR",
            "detail": f"Server error: {str(exc)}" if settings.APP_ENV != "production" else "An internal server error occurred on the DocMind server.",
            "request_id": request_id,
        },
        headers=headers,
    )

# Structured JSON request logging & rate limiting
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestLoggingMiddleware)

# CORS configuration
default_cors_regex = (
    r"https?://(localhost|127\.0\.0\.1|.*\.vercel\.app|.*\.pages\.dev|.*\.netlify\.app|.*\.railway\.app|.*\.rohanmane\.dev|.*\.docmind\.ai|.*\.docmind\.app|.*\.docmind\.dev)(:[0-9]+)?"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.effective_cors_origins,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX or default_cors_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers under /api/v1
app.include_router(health_router)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(workspaces_router, prefix="/api/v1")
app.include_router(documents_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1")
app.include_router(search_router, prefix="/api/v1")
app.include_router(compare_router, prefix="/api/v1")
app.include_router(usage_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(mock_storage_router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "service": "DocMind Document Intelligence API",
        "version": "1.0.0",
        "status": "online",
        "docs_url": "/docs" if settings.APP_ENV != "production" else None
    }
