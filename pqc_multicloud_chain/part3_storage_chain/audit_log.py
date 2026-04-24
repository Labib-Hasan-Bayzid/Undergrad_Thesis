# audit_log.py
from __future__ import annotations

import os
import json
from typing import Optional, Dict, Any

import psycopg


def _db_connect():
    return psycopg.connect(
        host=os.getenv("PGHOST", "127.0.0.1"),
        port=int(os.getenv("PGPORT", "5432")),
        dbname=os.getenv("PGDATABASE", "pqc_vault"),
        user=os.getenv("PGUSER", "abdullahadnan"),
        password=os.getenv("PGPASSWORD", ""),
        autocommit=True,
    )


def audit_event(
    action: str,
    *,
    ok: bool,
    actor: str = "anon",
    remote_addr: Optional[str] = None,
    file_id: Optional[str] = None,
    reason_code: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Matches your tls_audit table shape:
      ts (default now())
      actor NOT NULL
      remote_addr nullable
      action NOT NULL
      ok NOT NULL
      file_id nullable
      reason_code nullable
      details jsonb nullable
    """
    if not actor:
        actor = "anon"
    if details is None:
        details = {}

    conn = None
    try:
        conn = _db_connect()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tls_audit (actor, remote_addr, action, ok, file_id, reason_code, details)
                VALUES (%s, %s, %s, %s, %s::uuid, %s, %s::jsonb)
                """,
                (
                    actor,
                    remote_addr,
                    action,
                    bool(ok),
                    file_id if file_id else None,
                    reason_code,
                    json.dumps(details),
                ),
            )
    finally:
        try:
            if conn:
                conn.close()
        except Exception:
            pass
