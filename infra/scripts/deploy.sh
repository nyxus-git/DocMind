#!/bin/bash
set -euo pipefail

# DocMind Zero-Downtime Deployment & Health Check Routine
echo "[INFO] Commencing deployment of DocMind stack..."

# 1. Pull latest images
docker compose -f infra/compose.yaml pull api worker || true

# 2. Build backend if deploying from source
docker compose -f infra/compose.yaml build api worker

# 3. Apply database migrations
echo "[INFO] Running database schema migrations..."
docker compose -f infra/compose.yaml run --rm api python -c "
import asyncio
from app.db.session import async_engine, Base
import app.models

async def init_models():
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('Database schema ready.')

asyncio.run(init_models())
"

# 4. Restart API and Worker services
echo "[INFO] Restarting API and Worker containers..."
docker compose -f infra/compose.yaml up -d --no-deps api worker caddy

# 5. Live health check verification
echo "[INFO] Awaiting service readiness..."
sleep 4

HEALTH_URL="http://127.0.0.1:8000/health/ready"
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}" || echo "000")

if [ "${STATUS_CODE}" -ne 200 ]; then
    echo "[CRITICAL] Deployment health check failed with HTTP ${STATUS_CODE}!"
    echo "[INFO] Inspecting recent API logs:"
    docker compose -f infra/compose.yaml logs --tail=50 api
    exit 1
fi

echo "[SUCCESS] DocMind deployed and passing all readiness probes."
