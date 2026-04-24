#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
source .venv/bin/activate

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGDATABASE="${PGDATABASE:-pqc_vault}"
export PGUSER="${PGUSER:-abdullahadnan}"
# export PGPASSWORD="..."  # keep using your env or ~/.pgpass

# Policy knobs (override if needed)
export UPLOAD_TTL_MIN="${UPLOAD_TTL_MIN:-60}"
export UPLOAD_SESSIONS_TTL_DAYS="${UPLOAD_SESSIONS_TTL_DAYS:-7}"
export REPLAY_GUARD_TTL_SEC="${REPLAY_GUARD_TTL_SEC:-86400}"
export FAILED_PURGE_DAYS="${FAILED_PURGE_DAYS:-30}"
export PURGE_FAILED="${PURGE_FAILED:-0}"  # set 1 to delete old FAILED files

python hygiene_cleanup.py
