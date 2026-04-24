# kms_lib.py
# Industry-style DB-backed KMS helpers + rotation policy

from __future__ import annotations

import os
import json
import secrets
import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

DB_DSN = os.environ.get(
    "DB_DSN",
    "host=127.0.0.1 port=5432 dbname=pqc_vault user=abdullahadnan"
)

ALLOW_REVOKED_UNWRAP = os.getenv("ALLOW_REVOKED_KEK_UNWRAP", "0") == "1"


def kms_generate_random(n: int = 32) -> bytes:
    return secrets.token_bytes(n)


def _table_has_column(cur, table: str, col: str) -> bool:
    cur.execute(
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_name=%s AND column_name=%s
        """,
        (table, col),
    )
    return cur.fetchone() is not None


def _get_active_kek(cur):
    # Prefer ACTIVE status if column exists
    has_status = _table_has_column(cur, "kms_keks", "status")
    if has_status:
        cur.execute(
            "SELECT kek_version, kek_material FROM kms_keks WHERE active=true AND status='ACTIVE' LIMIT 1"
        )
    else:
        cur.execute(
            "SELECT kek_version, kek_material FROM kms_keks WHERE active=true LIMIT 1"
        )
    row = cur.fetchone()
    if not row:
        raise RuntimeError("NO_ACTIVE_KEK")
    return int(row[0]), bytes(row[1])


def _get_kek_by_version(cur, kek_version: int):
    has_status = _table_has_column(cur, "kms_keks", "status")
    if has_status:
        cur.execute(
            "SELECT kek_material, status FROM kms_keks WHERE kek_version=%s",
            (int(kek_version),),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError("KEK_VERSION_NOT_FOUND")
        material = bytes(row[0])
        status = str(row[1])
        return material, status
    else:
        cur.execute(
            "SELECT kek_material FROM kms_keks WHERE kek_version=%s",
            (int(kek_version),),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError("KEK_VERSION_NOT_FOUND")
        return bytes(row[0]), "ACTIVE"


def _audit(cur, actor: str, action: str, details: dict):
    # kms_audit exists in your DB, but keep it safe
    try:
        cur.execute(
            """
            INSERT INTO kms_audit (actor, action, details)
            VALUES (%s,%s,%s)
            """,
            (actor, action, json.dumps(details)),
        )
    except Exception:
        # do not break core crypto for missing audit table
        pass

    # key_rotation_log (optional)
    try:
        cur.execute(
            """
            INSERT INTO key_rotation_log (actor, action, details)
            VALUES (%s,%s,%s::jsonb)
            """,
            (actor, action, json.dumps(details)),
        )
    except Exception:
        pass


def kms_wrap_dek(dek: bytes):
    """
    Wraps DEK using active KEK.
    Returns (wrapped_bytes, nonce_bytes, kek_version_int)
    """
    if not isinstance(dek, (bytes, bytearray)) or len(dek) != 32:
        raise RuntimeError("BAD_DEK_LEN")

    nonce = secrets.token_bytes(12)

    with psycopg.connect(DB_DSN) as conn:
        with conn.cursor() as cur:
            kek_version, kek = _get_active_kek(cur)
            aes = AESGCM(kek)
            wrapped = aes.encrypt(nonce, bytes(dek), None)

            _audit(cur, "SYSTEM", "WRAP_DEK", {"kek_version": kek_version})
        conn.commit()

    return wrapped, nonce, kek_version


def kms_unwrap_dek(wrapped: bytes, nonce: bytes, kek_version: int) -> bytes:
    if wrapped is None or nonce is None:
        raise RuntimeError("MISSING_WRAPPED_OR_NONCE")

    if not isinstance(wrapped, (bytes, bytearray)):
        raise RuntimeError("BAD_WRAPPED_TYPE")
    if not isinstance(nonce, (bytes, bytearray)) or len(nonce) != 12:
        raise RuntimeError("BAD_NONCE_LEN")

    with psycopg.connect(DB_DSN) as conn:
        with conn.cursor() as cur:
            kek, status = _get_kek_by_version(cur, int(kek_version))

            if status.upper() == "REVOKED" and not ALLOW_REVOKED_UNWRAP:
                raise RuntimeError("KEK_REVOKED")

            aes = AESGCM(kek)
            dek = aes.decrypt(bytes(nonce), bytes(wrapped), None)

            _audit(cur, "SYSTEM", "UNWRAP_DEK", {"kek_version": int(kek_version), "status": status})
        conn.commit()

    if len(dek) != 32:
        raise RuntimeError("BAD_DEK_OUT_LEN")
    return dek


def kms_rotate_kek(actor: str = "SYSTEM") -> int:
    """
    Create a new KEK version, set it active, deactivate others.
    Returns new kek_version.
    """
    new_material = kms_generate_random(32)

    with psycopg.connect(DB_DSN) as conn:
        with conn.cursor() as cur:
            # Determine next version
            cur.execute("SELECT COALESCE(MAX(kek_version), 0) FROM kms_keks")
            maxv = int(cur.fetchone()[0] or 0)
            newv = maxv + 1

            # Deactivate existing
            cur.execute("UPDATE kms_keks SET active=false WHERE active=true")

            # Insert new
            # Columns might vary; we insert only safe expected ones.
            if _table_has_column(cur, "kms_keks", "status"):
                cur.execute(
                    """
                    INSERT INTO kms_keks (kek_version, kek_material, active, status)
                    VALUES (%s, %s, true, 'ACTIVE')
                    """,
                    (newv, new_material),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO kms_keks (kek_version, kek_material, active)
                    VALUES (%s, %s, true)
                    """,
                    (newv, new_material),
                )

            _audit(cur, actor, "ROTATE_KEK", {"new_kek_version": newv})
        conn.commit()

    return newv


def kms_revoke_kek(kek_version: int, actor: str = "SYSTEM", note: str = "") -> None:
    """
    Mark a KEK as REVOKED. Prevent unwrapping by default.
    """
    with psycopg.connect(DB_DSN) as conn:
        with conn.cursor() as cur:
            has_status = _table_has_column(cur, "kms_keks", "status")
            has_revoked_at = _table_has_column(cur, "kms_keks", "revoked_at")

            if has_status:
                if has_revoked_at:
                    cur.execute(
                        """
                        UPDATE kms_keks
                        SET status='REVOKED', revoked_at=now(), active=false
                        WHERE kek_version=%s
                        """,
                        (int(kek_version),),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE kms_keks
                        SET status='REVOKED', active=false
                        WHERE kek_version=%s
                        """,
                        (int(kek_version),),
                    )
            else:
                # fallback: just deactivate
                cur.execute(
                    "UPDATE kms_keks SET active=false WHERE kek_version=%s",
                    (int(kek_version),),
                )

            _audit(cur, actor, "REVOKE_KEK", {"kek_version": int(kek_version), "note": note})
        conn.commit()


def kms_list_keks() -> list[dict]:
    out = []
    with psycopg.connect(DB_DSN) as conn:
        with conn.cursor() as cur:
            has_status = _table_has_column(cur, "kms_keks", "status")
            if has_status:
                cur.execute(
                    "SELECT kek_version, active, status, created_at, revoked_at FROM kms_keks ORDER BY kek_version"
                )
                for v, active, status, created_at, revoked_at in cur.fetchall():
                    out.append(
                        {
                            "kek_version": int(v),
                            "active": bool(active),
                            "status": str(status),
                            "created_at": str(created_at),
                            "revoked_at": str(revoked_at) if revoked_at else None,
                        }
                    )
            else:
                cur.execute("SELECT kek_version, active FROM kms_keks ORDER BY kek_version")
                for v, active in cur.fetchall():
                    out.append({"kek_version": int(v), "active": bool(active), "status": "ACTIVE"})
    return out
