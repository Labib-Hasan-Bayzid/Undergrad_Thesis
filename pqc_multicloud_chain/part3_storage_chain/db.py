# db.py
from __future__ import annotations
import psycopg
from psycopg.rows import dict_row
from config import DB_DSN

def connect():
    return psycopg.connect(DB_DSN, row_factory=dict_row)

def ensure_schema():
    """
    Minimal schema assumptions.
    Your DB already exists; this is a safety net.
    """
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
            CREATE TABLE IF NOT EXISTS files (
                file_id UUID PRIMARY KEY,
                filename TEXT NOT NULL,
                file_size BIGINT NOT NULL,
                chunk_size INT NOT NULL,
                chunks_total INT NOT NULL DEFAULT 0,
                uploaded_chunks INT NOT NULL DEFAULT 0,
                merkle_root_sha3_512 BYTEA,
                final_hash_sha3_512 BYTEA,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
                salt BYTEA NOT NULL,
                dek_wrapped BYTEA NOT NULL,
                dek_wrap_nonce BYTEA NOT NULL,
                dek_wrap_salt BYTEA NOT NULL,
                dek_wrap_info TEXT NOT NULL DEFAULT 'wrap-dek-v1',

                kek_version INT NOT NULL DEFAULT 1,
                dek_version INT NOT NULL DEFAULT 1,
                rotated_at TIMESTAMPTZ
            );
            """)
            cur.execute("""
            CREATE TABLE IF NOT EXISTS chunks (
                file_id UUID NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
                chunk_index INT NOT NULL,
                chunk_hash_sha3_512 BYTEA NOT NULL,
                nonce BYTEA NOT NULL,
                size INT NOT NULL,
                PRIMARY KEY(file_id, chunk_index)
            );
            """)
            cur.execute("""
            CREATE TABLE IF NOT EXISTS key_rotation_log (
              id BIGSERIAL PRIMARY KEY,
              file_id UUID NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
              old_kek_version INT,
              new_kek_version INT,
              old_dek_version INT,
              new_dek_version INT,
              reason TEXT,
              actor TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """)
        conn.commit()
