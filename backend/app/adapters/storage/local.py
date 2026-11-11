import hashlib
import os
from typing import Any, Dict, Optional
from urllib.parse import quote
from app.adapters.storage.base import ObjectStorage
from app.adapters.storage.r2 import R2Storage
from app.core.config import settings
from app.core.http_safety import resolve_safe_inline_mime, sanitize_download_filename
from app.core.security import sign_storage_key


class LocalStorage(ObjectStorage):
    def __init__(self, base_dir: str = "/tmp/docmind_local_storage"):
        self.base_dir = os.path.abspath(base_dir)
        os.makedirs(self.base_dir, exist_ok=True)

    def _resolve_path(self, object_key: str) -> str:
        safe_key = object_key.replace("/", "_").replace("..", "_")
        resolved = os.path.abspath(os.path.join(self.base_dir, safe_key))
        if not resolved.startswith(self.base_dir + os.sep):
            raise ValueError("Invalid object key path.")
        return resolved

    async def create_upload_url(
        self,
        object_key: str,
        content_type: str,
        size_bytes: int,
        expires_in: int = 300
    ) -> Dict[str, Any]:
        exp, sig = sign_storage_key(object_key, "upload", expires_in=expires_in)
        encoded_key = quote(object_key, safe="")
        return {
            "upload_url": f"{settings.API_BASE_URL}/api/v1/mock-storage/upload?key={encoded_key}&exp={exp}&sig={sig}",
            "headers": {"Content-Type": content_type}
        }

    async def create_download_url(
        self,
        object_key: str,
        expires_in: int = 120,
        content_type: Optional[str] = None,
        filename: Optional[str] = None,
    ) -> str:
        exp, sig = sign_storage_key(object_key, "download", expires_in=expires_in)
        encoded_key = quote(object_key, safe="")
        url = f"{settings.API_BASE_URL}/api/v1/mock-storage/download?key={encoded_key}&exp={exp}&sig={sig}"
        if filename:
            safe_name = sanitize_download_filename(filename)
            url += f"&fn={quote(safe_name, safe='')}"
        safe_mime = resolve_safe_inline_mime(filename, content_type)
        if safe_mime:
            url += f"&ct={quote(safe_mime, safe='')}"
        return url

    async def head_object(self, object_key: str) -> Optional[Dict[str, Any]]:
        path = self._resolve_path(object_key)
        if not os.path.exists(path):
            return None
        size = os.path.getsize(path)
        return {
            "size_bytes": size,
            "content_type": "application/octet-stream",
            "etag": "mock-etag"
        }

    async def delete_object(self, object_key: str) -> bool:
        path = self._resolve_path(object_key)
        if os.path.exists(path):
            os.remove(path)
            return True
        return False

    async def download_bytes(self, object_key: str) -> bytes:
        path = self._resolve_path(object_key)
        if not os.path.exists(path):
            raise FileNotFoundError(f"Storage object {object_key} not found at {path}")
        with open(path, "rb") as f:
            return f.read()

    async def save_bytes(self, object_key: str, data: bytes) -> None:
        path = self._resolve_path(object_key)
        with open(path, "wb") as f:
            f.write(data)


def is_r2_configured() -> bool:
    return bool(
        settings.R2_ACCOUNT_ID.strip()
        and settings.R2_ACCESS_KEY_ID.strip()
        and settings.R2_SECRET_ACCESS_KEY.strip()
    )


def get_storage() -> ObjectStorage:
    if is_r2_configured():
        return R2Storage()
    return LocalStorage()
