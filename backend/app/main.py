from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.auth import router as auth_router
from app.api.v1.chat import router as chat_router
from app.api.v1.compare import router as compare_router
from app.api.v1.documents import mock_storage_router, router as documents_router
from app.api.v1.health import router as health_router
from app.api.v1.search import router as search_router
from app.api.v1.usage import router as usage_router
from app.api.v1.users import router as users_router
from app.core.config import settings
from app.core.exceptions import DocMindException, docmind_exception_handler
from app.core.logging import RequestLoggingMiddleware, setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    yield


app = FastAPI(
    title="DocMind API",
    version="1.0.0",
    description="Enterprise Document Intelligence & Grounded RAG Workspace",
    lifespan=lifespan
)

# Exception handlers (RFC 7807 problem details)
app.add_exception_handler(DocMindException, docmind_exception_handler)

# Structured JSON request logging & duration tracking
app.add_middleware(RequestLoggingMiddleware)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:[0-9]+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers under /api/v1
app.include_router(health_router)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(documents_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1")
app.include_router(search_router, prefix="/api/v1")
app.include_router(compare_router, prefix="/api/v1")
app.include_router(usage_router, prefix="/api/v1")
app.include_router(mock_storage_router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "service": "DocMind Document Intelligence API",
        "version": "1.0.0",
        "status": "online",
        "docs_url": "/docs" if settings.APP_ENV != "production" else None
    }
