#!/bin/bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$BACKUP_DIR"

echo "📦 Starting database backup..."
pg_dump \
  --format=custom \
  --file="$BACKUP_DIR/pqc_vault_$TIMESTAMP.dump" \
  "$PGDATABASE"

echo "✅ Backup complete:"
echo "   $BACKUP_DIR/pqc_vault_$TIMESTAMP.dump"
