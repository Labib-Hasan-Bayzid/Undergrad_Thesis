# kms_core.py
from __future__ import annotations

import os
import json
import secrets
import datetime as dt
import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _utcnow():
    return dt.datetime.now(dt.timezone.utc)


def kms_get_active_kek(conn) -> tuple[int, bytes]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT kek_version, kek_material FROM kms_keks WHERE active=true ORDER BY kek_version DESC LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError("No active KEK in kms_keks. Run kms_bootstrap.py first.")
        return int(row[0]), bytes(row[1])


def kms_audit(conn, actor: str, action: str, details: dict):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO kms_audit(ts, actor, action, details) VALUES (%s, %s, %s, %s)",
            (_utcnow(), actor, action, json.dumps(details)),
        )


def kms_wrap_dek(conn, dek: bytes, actor: str, aad: bytes | None = None) -> tuple[bytes, bytes, int]:
    kek_version, kek = kms_get_active_kek(conn)
    nonce = secrets.token_bytes(12)
    wrapped = AESGCM(kek).encrypt(nonce, dek, aad)
    kms_audit(conn, actor, "WRAP_DEK", {"kek_version": kek_version})
    return wrapped, nonce, kek_version


def kms_unwrap_dek(conn, wrapped_dek: bytes, wrap_nonce: bytes, kek_version: int, actor: str, aad: bytes | None = None) -> bytes:
    with conn.cursor() as cur:
        cur.execute("SELECT kek_material FROM kms_keks WHERE kek_version=%s LIMIT 1", (kek_version,))
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"KEK version {kek_version} not found in kms_keks.")
        kek = bytes(row[0])

    dek = AESGCM(kek).decrypt(wrap_nonce, wrapped_dek, aad)
    kms_audit(conn, actor, "UNWRAP_DEK", {"kek_version": kek_version})
    return dek
