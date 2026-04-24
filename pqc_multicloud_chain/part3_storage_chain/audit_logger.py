# audit_logger.py
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional, Dict, Any

def audit_log(
    conn,
    *,
    session_id: str,
    file_id: Optional[str],
    client_identity: Optional[str],
    client_ip: Optional[str],
    action: str,
    reason_code: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
):
    """
    Industry-grade audit logger.

    • Always commits (audit must never be rolled back accidentally)
    • Never throws to caller
    • JSON-serializes details safely
    """

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tls_audit (
                    ts,
                    session_id,
                    file_id,
                    client_identity,
                    client_ip,
                    action,
                    reason_code,
                    details
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    datetime.utcnow(),
                    session_id,
                    file_id,
                    client_identity,
                    client_ip,
                    action,
                    reason_code,
                    json.dumps(details) if details else None,
                ),
            )

        # 🔐 CRITICAL: commit explicitly
        conn.commit()

    except Exception as e:
        # Audit logging must NEVER break the main flow
        try:
            conn.rollback()
        except Exception:
            pass
