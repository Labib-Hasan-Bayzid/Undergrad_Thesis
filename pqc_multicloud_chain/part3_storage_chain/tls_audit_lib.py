# tls_audit_lib.py
from __future__ import annotations
import json
from typing import Optional, Any, Dict

def tls_audit(conn, *, actor: str, ip: Optional[str], action: str, ok: bool,
              file_id: Optional[str] = None, session_id: Optional[bytes] = None,
              details: Optional[Dict[str, Any]] = None) -> None:
    if details is None:
        details = {}
    # enforce JSON-serializable
    try:
        json.dumps(details)
    except Exception:
        details = {"note": "details_not_json_serializable"}

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO tls_audit(actor, ip, action, ok, file_id, session_id, details)
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (actor, ip, action, ok, file_id, session_id, json.dumps(details)),
        )
    conn.commit()
