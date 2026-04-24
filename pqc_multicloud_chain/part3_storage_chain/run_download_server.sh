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
: "${TLS_DL_MAX_REQ:=30}"
: "${TLS_DL_WINDOW_SEC:=60}"
: "${TLS_SERVER_LOG:=tls_server_download.log}"

export TLS_SOCKET_TIMEOUT TLS_DL_MAX_REQ TLS_DL_WINDOW_SEC TLS_SERVER_LOG

echo "[RUN] download server starting..."
echo "[CFG] PG=$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
echo "[CFG] timeout=$TLS_SOCKET_TIMEOUT rate=$TLS_DL_MAX_REQ/$TLS_DL_WINDOW_SEC log=$TLS_SERVER_LOG"

# Run with logs appended
python -u tls_server_download.py 2>&1 | tee -a "$TLS_SERVER_LOG"