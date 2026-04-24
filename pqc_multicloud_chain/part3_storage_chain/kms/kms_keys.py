import os
import json
import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .kms_core import get_active_kek

DB_DSN = "dbname=pqc_vault user=abdullahadnan password=" + os.environ["PGPASSWORD"]


def wrap_dek(dek: bytes, actor="system"):
    with psycopg.connect(DB_DSN) as conn:
        kek_version, kek = get_active_kek(conn)
        aes = AESGCM(kek)
        nonce = os.urandom(12)
        wrapped = aes.encrypt(nonce, dek, None)

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO kms_audit (actor, action, details)
                VALUES (%s, 'WRAP_DEK', %s)
            """, (actor, json.dumps({"kek_version": kek_version}),))
            conn.commit()

        return wrapped, nonce, kek_version


def unwrap_dek(wrapped: bytes, nonce: bytes, kek_version: int, actor="system"):
    with psycopg.connect(DB_DSN) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT kek_material FROM kms_keks
                WHERE kek_version=%s
            """, (kek_version,))
            kek = cur.fetchone()[0]

        aes = AESGCM(kek)
        dek = aes.decrypt(nonce, wrapped, None)

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO kms_audit (actor, action, details)
                VALUES (%s, 'UNWRAP_DEK', %s)
            """, (actor, json.dumps({"kek_version": kek_version}),))
            conn.commit()

        return dek
