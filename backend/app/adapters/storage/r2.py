import asyncio
from typing import Any, Dict, Optional
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from app.adapters.storage.base import ObjectStorage
from app.core.config import settings
from app.core.http_safety import resolve_safe_inline_mime, sanitize_download_filename


class R2Storage(ObjectStorage):
    def __init__(self):
        self.bucket = settings.R2_BUCKET.strip()
        raw_endpoint = (settings.R2_ENDPOINT_URL or "").strip().rstrip("/")
        if raw_endpoint and self.bucket and raw_endpoint.endswith(f"/{self.bucket}"):
            raw_endpoint = raw_endpoint[: -len(f"/{self.bucket}")]
        endpoint = raw_endpoint or f"https://{settings.R2_ACCOUNT_ID.strip()}.r2.cloudflarestorage.com"
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID.strip(),
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY.strip(),
            region_name="auto",
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    async def create_upload_url(
        self,
        object_key: str,
        content_type: str,
        size_bytes: int,
        expires_in: int = 300
    ) -> Dict[str, Any]:
        params = {
            "Bucket": self.bucket,
            "Key": object_key,
            "ContentType": content_type
        }
        url = await asyncio.to_thread(
            self.client.generate_presigned_url,
            "put_object",
            Params=params,
            ExpiresIn=expires_in
        )
        return {
            "upload_url": url,
            "headers": {"Content-Type": content_type}
        }

    async def create_download_url(
        self,
        object_key: str,
        expires_in: int = 120,
        content_type: Optional[str] = None,
        filename: Optional[str] = None,
    ) -> str:
        params: Dict[str, Any] = {
            "Bucket": self.bucket,
            "Key": object_key,
        }
        safe_mime = resolve_safe_inline_mime(filename, content_type)
        if safe_mime:
            params["ResponseContentType"] = safe_mime
        if filename:
            safe_name = sanitize_download_filename(filename)
            params["ResponseContentDisposition"] = f'inline; filename="{safe_name}"'
        return await asyncio.to_thread(
            self.client.generate_presigned_url,
            "get_object",
            Params=params,
            ExpiresIn=expires_in,
        )

    async def head_object(self, object_key: str) -> Optional[Dict[str, Any]]:
        try:
            res = await asyncio.to_thread(
                self.client.head_object,
                Bucket=self.bucket,
                Key=object_key
            )
            return {
                "size_bytes": res.get("ContentLength", 0),
                "content_type": res.get("ContentType", ""),
                "etag": res.get("ETag", "").strip('"')
            }
        except ClientError:
            return None

    async def delete_object(self, object_key: str) -> bool:
        try:
            await asyncio.to_thread(
                self.client.delete_object,
                Bucket=self.bucket,
                Key=object_key
            )
            return True
        except ClientError:
            return False

    async def download_bytes(self, object_key: str) -> bytes:
        response = await asyncio.to_thread(
            self.client.get_object,
            Bucket=self.bucket,
            Key=object_key
        )
        return await asyncio.to_thread(response["Body"].read)

    async def upload_bytes(self, object_key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        await asyncio.to_thread(
            self.client.put_object,
            Bucket=self.bucket,
            Key=object_key,
            Body=data,
            ContentType=content_type,
        )
