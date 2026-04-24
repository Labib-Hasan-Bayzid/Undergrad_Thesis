# kms_client.py
import os
import json
import secrets
import psycopg
from psycopg.rows import dict_row

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


DB_DSN = os.getenv("DB_DSN", "postgresql://abdullahadnan@127.0.0.1:5432/pqc_vault")


def _audit(conn, actor: str, action: str, details: dict):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO kms_audit(actor, action, details) VALUES (%s, %s, %s::jsonb)",
            (actor, action, json.dumps(details)),
        )


def get_active_kek(conn) -> dict:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT kek_version, kek_material FROM kms_keks WHERE active=true ORDER BY kek_version DESC LIMIT 1;")
        row = cur.fetchone()
        if not row:
            raise RuntimeError("No active KEK found in kms_keks. Run: python kms_bootstrap.py")
        return {"kek_version": row["kek_version"], "kek_material": bytes(row["kek_material"])}


def kms_randomness(n: int = 32) -> bytes:
    return secrets.token_bytes(n)


def wrap_dek(conn, dek: bytes, file_id: str, actor: str = "SYSTEM") -> tuple[int, bytes, bytes]:
    """
    Wrap DEK using active KEK via AES-GCM:
      wrapped = AESGCM(KEK).encrypt(nonce, dek, aad=file_id)
    Returns: (kek_version, wrap_nonce, wrapped_dek)
    """
    kek = get_active_kek(conn)
    kek_version = int(kek["kek_version"])
    key = kek["kek_material"]
    if len(key) != 32:
        raise RuntimeError("KEK material must be 32 bytes (AES-256).")

    nonce = secrets.token_bytes(12)
    aesgcm = AESGCM(key)
    wrapped = aesgcm.encrypt(nonce, dek, file_id.encode("utf-8"))

    _audit(conn, actor, "WRAP_DEK", {"kek_version": kek_version, "file_id": file_id})
    return kek_version, nonce, wrapped


def unwrap_dek(conn, kek_version: int, wrap_nonce: bytes, wrapped_dek: bytes, file_id: str, actor: str = "SYSTEM") -> bytes:
    """
    Decrypt wrapped DEK with specified KEK version.
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT kek_material FROM kms_keks WHERE kek_version=%s LIMIT 1;", (kek_version,))
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"KEK version {kek_version} not found")
        key = bytes(row["kek_material"])

    aesgcm = AESGCM(key)
    dek = aesgcm.decrypt(wrap_nonce, wrapped_dek, file_id.encode("utf-8"))
    _audit(conn, actor, "UNWRAP_DEK", {"kek_version": int(kek_version), "file_id": file_id})
    return dek
