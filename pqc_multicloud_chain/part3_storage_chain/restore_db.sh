#!/bin/bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: ./restore_db.sh <dump_file>"
  exit 1
fi

DUMP_FILE="$1"

echo "⚠️  RESTORING DATABASE FROM:"
echo "   $DUMP_FILE"
echo "Press ENTER to continue or Ctrl+C to abort."
read

pg_restore \
  --clean \
  --if-exists \
  --dbname="$PGDATABASE" \
  "$DUMP_FILE"

echo "✅ Restore complete."
