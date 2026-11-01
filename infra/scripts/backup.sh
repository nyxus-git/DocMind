#!/bin/bash
set -euo pipefail

# DocMind Automated Nightly Backup Script
# Dumps PostgreSQL database, compresses, encrypts with AES-256, and uploads to R2

TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
BACKUP_DIR="/tmp/docmind_backups"
BACKUP_FILE="${BACKUP_DIR}/docmind_db_${TIMESTAMP}.dump.gz"
ENCRYPTED_FILE="${BACKUP_FILE}.enc"

mkdir -p "${BACKUP_DIR}"

echo "[INFO] Starting database backup at ${TIMESTAMP}..."
docker compose -f infra/compose.yaml exec -T postgres pg_dump -U "${POSTGRES_USER:-docmind}" -Fc "${POSTGRES_DB:-docmind}" | gzip -9 > "${BACKUP_FILE}"

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    echo "[INFO] Encrypting snapshot with AES-256-CBC..."
    openssl enc -aes-256-cbc -salt -pbkdf2 -in "${BACKUP_FILE}" -out "${ENCRYPTED_FILE}" -pass env:BACKUP_PASSPHRASE
    UPLOAD_TARGET="${ENCRYPTED_FILE}"
else
    UPLOAD_TARGET="${BACKUP_FILE}"
fi

if [ -n "${R2_BUCKET:-}" ] && [ -n "${R2_ACCOUNT_ID:-}" ]; then
    echo "[INFO] Uploading backup to Cloudflare R2: backups/db/${TIMESTAMP}.dump.gz..."
    aws s3 cp "${UPLOAD_TARGET}" "s3://${R2_BUCKET}/backups/db/${TIMESTAMP}.dump.gz" \
        --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
fi

rm -rf "${BACKUP_DIR}"
echo "[INFO] Backup routine completed successfully."
