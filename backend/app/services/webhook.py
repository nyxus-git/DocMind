import hashlib
import hmac
import json
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import List, Optional
import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import EntityNotFoundException
from app.models.entities import WorkspaceWebhook
from app.schemas.webhook import (
    WebhookCreatedDTO,
    WebhookDTO,
    WebhookTestPingResponse,
)


class WebhookService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_webhooks(self, workspace_id: uuid.UUID) -> List[WebhookDTO]:
        result = await self.db.execute(
            select(WorkspaceWebhook)
            .where(WorkspaceWebhook.workspace_id == workspace_id)
            .order_by(WorkspaceWebhook.created_at.desc())
        )
        hooks = result.scalars().all()
        return [
            WebhookDTO(
                id=h.id,
                workspace_id=h.workspace_id,
                url=h.url,
                description=h.description,
                events=h.events or [],
                is_active=h.is_active,
                last_triggered_at=h.last_triggered_at,
                failure_count=h.failure_count,
                created_at=h.created_at,
            )
            for h in hooks
        ]

    async def create_webhook(
        self,
        workspace_id: uuid.UUID,
        created_by: Optional[uuid.UUID],
        url: str,
        description: Optional[str] = None,
        events: Optional[List[str]] = None,
    ) -> WebhookCreatedDTO:
        clean_events = events or ["document.ready", "document.failed"]
        secret = f"whsec_{secrets.token_hex(24)}"
        hook = WorkspaceWebhook(
            workspace_id=workspace_id,
            created_by=created_by,
            url=url,
            description=description,
            secret=secret,
            events=clean_events,
            is_active=True,
        )
        self.db.add(hook)
        await self.db.flush()

        return WebhookCreatedDTO(
            id=hook.id,
            workspace_id=hook.workspace_id,
            url=hook.url,
            description=hook.description,
            events=hook.events or [],
            is_active=hook.is_active,
            last_triggered_at=hook.last_triggered_at,
            failure_count=hook.failure_count,
            created_at=hook.created_at,
            secret=secret,
        )

    async def delete_webhook(self, workspace_id: uuid.UUID, webhook_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(WorkspaceWebhook).where(
                WorkspaceWebhook.id == webhook_id,
                WorkspaceWebhook.workspace_id == workspace_id,
            )
        )
        hook = result.scalar_one_or_none()
        if not hook:
            raise EntityNotFoundException("Webhook", webhook_id)

        await self.db.delete(hook)
        await self.db.flush()

    async def test_ping(self, workspace_id: uuid.UUID, webhook_id: uuid.UUID) -> WebhookTestPingResponse:
        result = await self.db.execute(
            select(WorkspaceWebhook).where(
                WorkspaceWebhook.id == webhook_id,
                WorkspaceWebhook.workspace_id == workspace_id,
            )
        )
        hook = result.scalar_one_or_none()
        if not hook:
            raise EntityNotFoundException("Webhook", webhook_id)

        payload = {
            "event": "ping",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "workspace_id": str(workspace_id),
            "data": {
                "message": "DocMind production webhook test ping",
                "webhook_id": str(webhook_id),
            },
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        signature = hmac.new(hook.secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "DocMind-Webhook/2.0",
            "X-DocMind-Signature": f"sha256={signature}",
            "X-DocMind-Event": "ping",
        }

        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.post(hook.url, content=body_bytes, headers=headers)
                latency = int((time.perf_counter() - start) * 1000)
                success = 200 <= res.status_code < 300
                preview = res.text[:200] if res.text else f"Status HTTP {res.status_code}"

                hook.last_triggered_at = datetime.now(timezone.utc)
                if not success:
                    hook.failure_count += 1
                await self.db.flush()

                return WebhookTestPingResponse(
                    webhook_id=hook.id,
                    success=success,
                    status_code=res.status_code,
                    response_preview=preview,
                    latency_ms=latency,
                )
        except Exception as e:
            latency = int((time.perf_counter() - start) * 1000)
            hook.last_triggered_at = datetime.now(timezone.utc)
            hook.failure_count += 1
            await self.db.flush()

            return WebhookTestPingResponse(
                webhook_id=hook.id,
                success=False,
                status_code=0,
                response_preview=f"Connection error: {str(e)[:150]}",
                latency_ms=latency,
            )

