import os
import re
from typing import Any, Dict, Optional
from fastapi import Request
from app.core.config import settings

DEFAULT_CORS_REGEX = (
    r"https?://(localhost|127\.0\.0\.1|.*\.vercel\.app|.*\.pages\.dev|.*\.netlify\.app|.*\.railway\.app|.*\.rohanmane\.dev|.*\.docmind\.ai|.*\.docmind\.app|.*\.docmind\.dev)(:[0-9]+)?"
)

_SAFE_INLINE_MIME_BY_EXT = {
    ".pdf": "application/pdf",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    # Serve uploaded HTML as plain text to prevent stored XSS if opened in a browser tab.
    ".html": "text/plain; charset=utf-8",
    ".htm": "text/plain; charset=utf-8",
}


def is_origin_allowed(origin: str) -> bool:
    """Validates an Origin header against configured origins or allowlist regex."""
    candidate = (origin or "").strip()
    if not candidate:
        return False
    if candidate in settings.effective_cors_origins:
        return True
    pattern = settings.CORS_ORIGIN_REGEX or DEFAULT_CORS_REGEX
    return bool(re.fullmatch(pattern, candidate))


def cors_headers_for_request(request: Request) -> Dict[str, str]:
    """Returns CORS headers only when the request Origin is explicitly permitted."""
    origin = (request.headers.get("Origin") or "").strip()
    if not is_origin_allowed(origin):
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }


def csv_safe_cell(value: Any) -> str:
    """Neutralizes spreadsheet formula injection in exported CSV cells."""
    text = "" if value is None else str(value)
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{text}"
    return text


def sanitize_download_filename(filename: Optional[str]) -> str:
    """Normalizes filenames for safe ASCII Content-Disposition headers."""
    cleaned = os.path.basename((filename or "").strip())
    cleaned = re.sub(r"[^A-Za-z0-9._ -]", "_", cleaned).strip(" .")
    return cleaned or "document"


def resolve_safe_inline_mime(filename: Optional[str], declared_mime: Optional[str] = None) -> str:
    """Resolves a safe browser Content-Type from filename/declared MIME without enabling HTML/SVG script execution."""
    ext = os.path.splitext((filename or "").strip().lower())[1]
    if ext in _SAFE_INLINE_MIME_BY_EXT:
        return _SAFE_INLINE_MIME_BY_EXT[ext]

    mime = (declared_mime or "").split(";")[0].strip().lower()
    if mime == "application/pdf":
        return "application/pdf"
    if mime in ("application/json", "text/csv", "text/plain", "text/markdown"):
        return f"{mime}; charset=utf-8" if mime.startswith("text/") else mime
    if mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return mime
    return "application/octet-stream"

