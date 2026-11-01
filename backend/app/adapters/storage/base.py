from typing import Any, Dict, Optional, Protocol


class ObjectStorage(Protocol):
    async def create_upload_url(
        self,
        object_key: str,
        content_type: str,
        size_bytes: int,
        expires_in: int = 300
    ) -> Dict[str, Any]:
        """Creates presigned PUT URL with required headers and expiration."""
        ...

    async def create_download_url(
        self,
        object_key: str,
        expires_in: int = 120
    ) -> str:
        """Creates short-lived presigned GET URL."""
        ...

    async def head_object(self, object_key: str) -> Optional[Dict[str, Any]]:
        """Retrieves object metadata (size, etag, content-type) or None if missing."""
        ...

    async def delete_object(self, object_key: str) -> bool:
        """Deletes object and returns True if successful."""
        ...

    async def download_bytes(self, object_key: str) -> bytes:
        """Downloads full object bytes for worker parsing."""
        ...
