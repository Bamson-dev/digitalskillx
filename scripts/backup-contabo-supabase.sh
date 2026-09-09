#!/usr/bin/env bash
# Backup Contabo self-hosted Supabase Postgres (run on the Coolify VPS).
# Usage:
#   export POSTGRES_PASSWORD=...   # SERVICE_PASSWORD_POSTGRES from Coolify
#   ./scripts/backup-contabo-supabase.sh
set -euo pipefail

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT_DIR=${BACKUP_DIR:-/var/lib/coolify/backups/digitalskillx-supabase}
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/postgres-$STAMP.dump"

DB_HOST=${POSTGRES_HOST:-supabase-db}
DB_USER=${POSTGRES_USER:-postgres}
DB_NAME=${POSTGRES_DB:-postgres}

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "POSTGRES_PASSWORD is required" >&2
  exit 1
fi

echo "Dumping $DB_NAME @ $DB_HOST → $FILE"
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -Fc -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" >"$FILE"
ls -lh "$FILE"

# Keep last 14 dumps
ls -1t "$OUT_DIR"/postgres-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "Done."
