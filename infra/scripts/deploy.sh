#!/bin/bash
set -euo pipefail

# DocMind Zero-Downtime Deployment & Health Check Routine
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

echo "[INFO] Commencing deployment of DocMind stack in ${PROJECT_ROOT}..."

if [ ! -f "${PROJECT_ROOT}/.env" ]; then
    echo "[WARNING] .env file not found in ${PROJECT_ROOT}."
    echo "[INFO] Checking if .env.production or .env.example exists..."
    if [ -f "${PROJECT_ROOT}/.env.production" ]; then
        cp "${PROJECT_ROOT}/.env.production" "${PROJECT_ROOT}/.env"
        echo "[INFO] Copied .env.production to .env"
    fi
fi

# 1. Ensure Postgres service is running & healthy
echo "[INFO] Ensuring Postgres database service is running..."
docker compose -f infra/compose.yaml up -d postgres

# 2. Build backend API & Worker containers
echo "[INFO] Building backend & worker Docker containers..."
docker compose -f infra/compose.yaml build api worker

# 3. Apply full database schema migrations & seed checks
echo "[INFO] Executing database schema migrations..."
docker compose -f infra/compose.yaml run --rm api python -m app.db.migrate

# 4. Start/Restart API, Worker, and Caddy services
echo "[INFO] Launching API, Worker, and Caddy services..."
docker compose -f infra/compose.yaml up -d api worker caddy

# 5. Live health check verification with retries
echo "[INFO] Awaiting service readiness (http://127.0.0.1:8000/health/ready)..."
MAX_RETRIES=12
RETRY_COUNT=0
HEALTH_URL="http://127.0.0.1:8000/health/ready"
STATUS_CODE="000"

until [ "${RETRY_COUNT}" -ge "${MAX_RETRIES}" ]; do
    STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}" || echo "000")
    if [ "${STATUS_CODE}" -eq 200 ]; then
        echo "[SUCCESS] Health check passed (HTTP 200). DocMind is ready!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "[WAIT] Probe attempt ${RETRY_COUNT}/${MAX_RETRIES}: Backend returned HTTP ${STATUS_CODE}. Retrying in 3s..."
    sleep 3
done

if [ "${STATUS_CODE}" -ne 200 ]; then
    echo "[CRITICAL] Deployment failed! Readiness probe failed after ${MAX_RETRIES} attempts (HTTP ${STATUS_CODE})."
    echo "[INFO] Recent API container logs:"
    docker compose -f infra/compose.yaml logs --tail=60 api
    exit 1
fi

# 6. Reclaim disk space by pruning dangling images
echo "[INFO] Pruning dangling Docker images to reclaim disk space..."
docker image prune -f || true

echo "[SUCCESS] DocMind deployed and passing all readiness probes."
