#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
source .venv/bin/activate

# Load .env if exists
if [[ -f ".env" ]]; then
  export $(grep -v '^#' .env | xargs) || true
fi

: "${PGHOST:?missing PGHOST}"
: "${PGPORT:?missing PGPORT}"
: "${PGDATABASE:?missing PGDATABASE}"
: "${PGUSER:?missing PGUSER}"
: "${PGPASSWORD:?missing PGPASSWORD}"

: "${TLS_SOCKET_TIMEOUT:=30}"

export TLS_SOCKET_TIMEOUT

echo "[RUN] upload server starting..."
echo "[CFG] PG=$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
echo "[CFG] timeout=$TLS_SOCKET_TIMEOUT"

python -u tls_server_hybrid_store_chain.py 2>&1 | tee -a tls_server_upload.log