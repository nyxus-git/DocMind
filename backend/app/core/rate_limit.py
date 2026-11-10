import os
import time
from collections import deque
from typing import Deque, Dict, Optional, Tuple
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.config import settings


class SlidingWindowLimiter:
    """In-memory sliding-window rate limiter with bounded bucket eviction."""

    def __init__(self, max_buckets: int = 10000):
        self._buckets: Dict[str, Deque[float]] = {}
        self._max_buckets = max_buckets

    def check(self, key: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - window_seconds

        if key not in self._buckets and len(self._buckets) >= self._max_buckets:
            # Evict oldest buckets to cap memory usage
            stale_keys = list(self._buckets.keys())[: max(1, self._max_buckets // 10)]
            for k in stale_keys:
                self._buckets.pop(k, None)

        bucket = self._buckets.setdefault(key, deque())
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

        if len(bucket) >= max_requests:
            retry_after = max(1, int(bucket[0] + window_seconds - now) + 1)
            return False, retry_after

        bucket.append(now)
        return True, 0


_limiter = SlidingWindowLimiter()


def _resolve_rule(method: str, path: str) -> Optional[Tuple[str, int, int]]:
    """Returns (bucket_group, max_requests, window_seconds) for sensitive endpoints."""
    if method != "POST":
        return None
    if path in {
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/resend-verification",
    }:
        return ("auth", 20, 60)
    if path.endswith("/messages") or path.endswith("/compare") or path.endswith("/extract"):
        return ("ai", 40, 60)
    if path == "/api/v1/documents/upload-intents":
        return ("upload", 40, 60)
    return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.RATE_LIMIT_ENABLED or os.environ.get("PYTEST_CURRENT_TEST"):
            return await call_next(request)

        rule = _resolve_rule(request.method, request.url.path)
        if not rule:
            return await call_next(request)

        group, limit, window = rule
        forwarded = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        client_ip = forwarded or (request.client.host if request.client else "unknown")
        key = f"{group}:{client_ip}"

        allowed, retry_after = _limiter.check(key, limit, window)
        if not allowed:
            origin = request.headers.get("Origin") or "*"
            return JSONResponse(
                status_code=429,
                content={
                    "type": "https://docmind.ai/errors/rate_limit_exceeded",
                    "title": "Too Many Requests",
                    "status": 429,
                    "code": "RATE_LIMIT_EXCEEDED",
                    "detail": f"Rate limit exceeded. Please wait {retry_after} seconds and try again.",
                },
                headers={
                    "Retry-After": str(retry_after),
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Credentials": "true",
                },
            )

        return await call_next(request)
