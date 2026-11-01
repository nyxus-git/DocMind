import json
import logging
import sys
import time
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
import uuid


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        for attr in ["request_id", "user_id", "workspace_id", "job_id", "duration_ms"]:
            if hasattr(record, attr):
                log_obj[attr] = getattr(record, attr)
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)


def setup_logging():
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.handlers = [handler]


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        start_time = time.time()
        
        response = await call_next(request)
        
        duration_ms = round((time.time() - start_time) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        
        # Avoid logging noisy health checks in normal logs
        if not request.url.path.startswith("/health"):
            logger = logging.getLogger("docmind.access")
            logger.info(
                f"{request.method} {request.url.path} {response.status_code}",
                extra={"request_id": request_id, "duration_ms": duration_ms}
            )
        return response
