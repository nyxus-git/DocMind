import hashlib
import os
from typing import Any, Dict, Optional
from app.adapters.storage.base import ObjectStorage
from app.adapters.storage.r2 import R2Storage
from app.core.config import settings


class LocalStorage(ObjectStorage):
    def __init__(self, base_dir: str = "/tmp/docmind_local_storage"):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def _resolve_path(self, object_key: str) -> str:
        safe_key = object_key.replace("/", "_")
        return os.path.join(self.base_dir, safe_key)

    async def create_upload_url(
        self,
        object_key: str,
        content_type: str,
        size_bytes: int,
        expires_in: int = 300
    ) -> Dict[str, Any]:
        return {
            "upload_url": f"{settings.API_BASE_URL}/api/v1/mock-storage/upload?key={object_key}",
            "headers": {"Content-Type": content_type}
        }

    async def create_download_url(
        self,
        object_key: str,
        expires_in: int = 120
    ) -> str:
        return f"{settings.API_BASE_URL}/api/v1/mock-storage/download?key={object_key}"

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


def get_storage() -> ObjectStorage:
    if settings.R2_ACCOUNT_ID and settings.R2_ACCESS_KEY_ID:
        return R2Storage()
    return LocalStorage()
