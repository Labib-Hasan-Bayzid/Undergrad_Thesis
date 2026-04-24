# store_file_envelope.py
from __future__ import annotations

import os
import json
import uuid
from pathlib import Path
from typing import Tuple, Optional

import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from crypto_utils import sha3_512, hkdf_sha3_512
from tls_wire import recv_msg, send_msg, MSG_FILE_CHUNK, MSG_FILE_END, MSG_DONE, MSG_ERROR
from lifecycle import finalize_file_atomic, expected_chunks, CLOUDS_DEFAULT
from kms_lib import kms_wrap_dek, kms_unwrap_dek


# -----------------------------
# Filesystem storage helpers
# -----------------------------
def _cloud_base_dir(cloud_name: str) -> Path:
    # cloud_name is like "cloud_A"
    return Path(cloud_name)

def _chunk_path(cloud_name: str, file_id: str, chunk_index: int) -> Path:
    return _cloud_base_dir(cloud_name) / file_id / f"{chunk_index:08d}.bin"

def _manifest_path(cloud_name: str, file_id: str) -> Path:
    return _cloud_base_dir(cloud_name) / file_id / "manifest.json"

def _ensure_cloud_dirs(file_id: str, clouds: Tuple[str, ...]) -> None:
    for c in clouds:
        (_cloud_base_dir(c) / file_id).mkdir(parents=True, exist_ok=True)

def _write_chunk_blob_to_clouds(
    *,
    file_id: str,
    chunk_index: int,
    blob: bytes,
    clouds: Tuple[str, ...],
) -> None:
    name = f"{chunk_index:08d}.bin"
    for c in clouds:
        p = _cloud_base_dir(c) / file_id / name
        p.write_bytes(blob)

def _write_manifest_to_clouds(file_id: str, manifest: dict, clouds: Tuple[str, ...]) -> None:
    payload = json.dumps(manifest, indent=2).encode("utf-8")
    for c in clouds:
        p = _manifest_path(c, file_id)
        p.write_bytes(payload)


def _has_column(conn: psycopg.Connection, table: str, col: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema='public' AND table_name=%s AND column_name=%s
            """,
            (table, col),
        )
        return cur.fetchone() is not None


def _ensure_upload_sessions(conn: psycopg.Connection) -> None:
    with conn.transaction():
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS upload_sessions (
              upload_token TEXT PRIMARY KEY,
              file_id UUID NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_upload_sessions_file_id ON upload_sessions(file_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_upload_sessions_created_at ON upload_sessions(created_at)")


def _get_file_id_for_token(conn: psycopg.Connection, upload_token: str) -> Optional[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT file_id FROM upload_sessions WHERE upload_token=%s", (upload_token,))
        row = cur.fetchone()
    return str(row[0]) if row else None


def _bind_token_to_file(conn: psycopg.Connection, upload_token: str, file_id: str) -> None:
    with conn.transaction():
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO upload_sessions (upload_token, file_id)
            VALUES (%s, %s::uuid)
            ON CONFLICT (upload_token) DO NOTHING
            """,
            (upload_token, file_id),
        )


def _load_existing_dek(conn: psycopg.Connection, file_id: str) -> AESGCM:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT status, dek_wrapped, dek_wrap_nonce, kek_version
            FROM files
            WHERE file_id=%s
            """,
            (file_id,),
        )
        row = cur.fetchone()
    if not row:
        raise RuntimeError("FILE_NOT_FOUND")
    status, wrapped, nonce, kek_version = row
    if wrapped is None or nonce is None:
        raise RuntimeError("MISSING_WRAPPED_DEK")
    dek = kms_unwrap_dek(wrapped, nonce, int(kek_version) if kek_version is not None else 0)
    if len(dek) != 32:
        raise RuntimeError("DEK_LEN_BAD")
    return AESGCM(dek)


def _insert_new_file_row(
    conn: psycopg.Connection,
    *,
    file_id: str,
    filename: str,
    file_size: int,
    chunk_size: int,
    chunks_total: int,
    wrapped_dek: bytes,
    wrap_nonce: bytes,
    dek_wrap_salt: bytes,
    dek_wrap_info: str,
    kek_version: int,
    transcript_hash_sha3_512: bytes,
) -> None:
    cols = ["file_id", "filename", "file_size", "chunk_size", "chunks_total", "status", "uploaded_chunks"]
    vals = ["%s::uuid", "%s", "%s", "%s", "%s", "'UPLOADING'", "0"]
    params = [file_id, filename, file_size, chunk_size, chunks_total]

    if _has_column(conn, "files", "dek_wrapped"):
        cols.append("dek_wrapped"); vals.append("%s"); params.append(wrapped_dek)
    if _has_column(conn, "files", "dek_wrap_nonce"):
        cols.append("dek_wrap_nonce"); vals.append("%s"); params.append(wrap_nonce)
    if _has_column(conn, "files", "dek_wrap_salt"):
        cols.append("dek_wrap_salt"); vals.append("%s"); params.append(dek_wrap_salt)
    if _has_column(conn, "files", "dek_wrap_info"):
        cols.append("dek_wrap_info"); vals.append("%s"); params.append(dek_wrap_info)
    if _has_column(conn, "files", "kek_version"):
        cols.append("kek_version"); vals.append("%s"); params.append(int(kek_version))

    if _has_column(conn, "files", "transcript_hash_sha3_512"):
        cols.append("transcript_hash_sha3_512"); vals.append("%s"); params.append(transcript_hash_sha3_512)

    if _has_column(conn, "files", "hybrid_mode"):
        cols.append("hybrid_mode"); vals.append("%s"); params.append("x25519+kyber768")
    if _has_column(conn, "files", "kdf_info"):
        cols.append("kdf_info"); vals.append("%s"); params.append("hkdf-sha3-512(ikm=hybrid_secret, info=transcript_hash||dek_wrap_info)")
    if _has_column(conn, "files", "tls_binding_mode"):
        cols.append("tls_binding_mode"); vals.append("%s"); params.append("inband-hybrid-over-tls13")

    if _has_column(conn, "files", "last_activity_at"):
        cols.append("last_activity_at"); vals.append("now()")

    with conn.transaction():
        cur = conn.cursor()
        cur.execute(
            f"INSERT INTO files ({', '.join(cols)}) VALUES ({', '.join(vals)})",
            tuple(params),
        )


def store_stream_tls(
    conn: psycopg.Connection,
    tls_sock,
    filename: str,
    file_size: int,
    hybrid_session_secret: bytes,
    transcript_hash_sha3_512: bytes,
    chunk_size: int = 8 * 1024 * 1024,
    clouds: Tuple[str, ...] = CLOUDS_DEFAULT,
    upload_token: Optional[str] = None,
) -> str:
    if file_size <= 0:
        raise RuntimeError("BAD_FILE_SIZE")
    if chunk_size <= 0:
        raise RuntimeError("BAD_CHUNK_SIZE")
    if not transcript_hash_sha3_512 or len(transcript_hash_sha3_512) != 64:
        raise RuntimeError("BAD_TRANSCRIPT_HASH")

    chunks_total = expected_chunks(file_size, chunk_size)

    _ensure_upload_sessions(conn)

    # If upload_token exists, reuse file_id + reuse DEK (idempotent retry-safe)
    if upload_token:
        existing = _get_file_id_for_token(conn, upload_token)
        if existing:
            with conn.cursor() as cur:
                cur.execute("SELECT status FROM files WHERE file_id=%s", (existing,))
                r = cur.fetchone()
            if r and r[0] == "AVAILABLE":
                return existing

            with conn.transaction():
                cur = conn.cursor()
                if _has_column(conn, "files", "last_activity_at"):
                    cur.execute("UPDATE files SET last_activity_at=now() WHERE file_id=%s::uuid", (existing,))

            aes = _load_existing_dek(conn, existing)
            file_id = existing

            # ✅ ensure dirs exist even on retry
            _ensure_cloud_dirs(file_id, clouds)

        else:
            file_id = str(uuid.uuid4())
            _ensure_cloud_dirs(file_id, clouds)

            dek_wrap_salt = os.urandom(16)
            dek_wrap_info = "wrap-dek-v2-x25519-kyber768"
            info = transcript_hash_sha3_512 + dek_wrap_info.encode("utf-8")

            dek = hkdf_sha3_512(hybrid_session_secret, dek_wrap_salt, info, length=32)
            if len(dek) != 32:
                raise RuntimeError("DEK_LEN_BAD")

            wrapped_dek, wrap_nonce, kek_version = kms_wrap_dek(dek)
            aes = AESGCM(dek)

            _insert_new_file_row(
                conn,
                file_id=file_id,
                filename=filename,
                file_size=file_size,
                chunk_size=chunk_size,
                chunks_total=chunks_total,
                wrapped_dek=wrapped_dek,
                wrap_nonce=wrap_nonce,
                dek_wrap_salt=dek_wrap_salt,
                dek_wrap_info=dek_wrap_info,
                kek_version=int(kek_version),
                transcript_hash_sha3_512=transcript_hash_sha3_512,
            )

            _bind_token_to_file(conn, upload_token, file_id)

    else:
        file_id = str(uuid.uuid4())
        _ensure_cloud_dirs(file_id, clouds)

        dek_wrap_salt = os.urandom(16)
        dek_wrap_info = "wrap-dek-v2-x25519-kyber768"
        info = transcript_hash_sha3_512 + dek_wrap_info.encode("utf-8")

        dek = hkdf_sha3_512(hybrid_session_secret, dek_wrap_salt, info, length=32)
        if len(dek) != 32:
            raise RuntimeError("DEK_LEN_BAD")

        wrapped_dek, wrap_nonce, kek_version = kms_wrap_dek(dek)
        aes = AESGCM(dek)

        _insert_new_file_row(
            conn,
            file_id=file_id,
            filename=filename,
            file_size=file_size,
            chunk_size=chunk_size,
            chunks_total=chunks_total,
            wrapped_dek=wrapped_dek,
            wrap_nonce=wrap_nonce,
            dek_wrap_salt=dek_wrap_salt,
            dek_wrap_info=dek_wrap_info,
            kek_version=int(kek_version),
            transcript_hash_sha3_512=transcript_hash_sha3_512,
        )

    # -----------------------------
    # Receive chunks -> store on filesystem, keep DB metadata
    # -----------------------------
    received_any = False
    chunk_index = 0

    while True:
        msg_type, payload = recv_msg(tls_sock)

        if msg_type == MSG_FILE_CHUNK:
            received_any = True
            plaintext = payload
            if not plaintext:
                raise RuntimeError("EMPTY_CHUNK")
            if len(plaintext) > chunk_size:
                raise RuntimeError("CHUNK_TOO_LARGE")

            nonce = os.urandom(12)
            ct_with_tag = aes.encrypt(nonce, plaintext, None)      # nonce already separate
            ciphertext, tag = ct_with_tag[:-16], ct_with_tag[-16:]

            # ✅ store encrypted bytes in filesystem
            blob = nonce + ciphertext + tag
            _write_chunk_blob_to_clouds(file_id=file_id, chunk_index=chunk_index, blob=blob, clouds=clouds)

            # ✅ store plaintext hash in DB (your design used plaintext hash for byz quorum)
            h_plain = sha3_512(plaintext)

            # IMPORTANT: file_chunks.ciphertext is NOT NULL in your DB schema.
            # We keep it as a placeholder (empty bytes) and read ciphertext from filesystem during download.
            placeholder_ciphertext = b""

            with conn.transaction():
                cur = conn.cursor()
                for cloud in clouds:
                    cur.execute(
                        """
                        INSERT INTO file_chunks (file_id, chunk_index, cloud_id, ciphertext, nonce, tag, hash_sha3_512)
                        VALUES (%s::uuid, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (file_id, chunk_index, cloud_id) DO UPDATE
                        SET ciphertext=EXCLUDED.ciphertext,
                            nonce=EXCLUDED.nonce,
                            tag=EXCLUDED.tag,
                            hash_sha3_512=EXCLUDED.hash_sha3_512
                        """,
                        (file_id, chunk_index, cloud, placeholder_ciphertext, nonce, tag, h_plain),
                    )

                cur.execute(
                    "UPDATE files SET uploaded_chunks=%s WHERE file_id=%s::uuid",
                    (chunk_index + 1, file_id),
                )

                if _has_column(conn, "files", "last_activity_at"):
                    cur.execute(
                        "UPDATE files SET last_activity_at=now() WHERE file_id=%s::uuid",
                        (file_id,),
                    )

            chunk_index += 1
            continue

        if msg_type == MSG_FILE_END:
            break

        if msg_type == MSG_ERROR:
            raise RuntimeError("Client sent MSG_ERROR")

        raise RuntimeError("PROTOCOL_ERROR_UNEXPECTED_MSG")

    if not received_any:
        send_msg(tls_sock, MSG_ERROR, b'{"error_code":"NO_CHUNKS_RECEIVED"}')
        raise RuntimeError("NO_CHUNKS_RECEIVED")

    # Finalize (still DB-based hashes + quorum across clouds)
    merkle_root, final_hash = finalize_file_atomic(conn, file_id, clouds=clouds)

    with conn.transaction():
        cur = conn.cursor()
        if _has_column(conn, "files", "last_activity_at"):
            cur.execute("UPDATE files SET last_activity_at=now() WHERE file_id=%s::uuid", (file_id,))

    # Write manifest to filesystem clouds (nice for auditing/debug)
    manifest = {
        "file_id": file_id,
        "filename": filename,
        "file_size": int(file_size),
        "chunk_size": int(chunk_size),
        "chunks_total": int(chunks_total),
        "merkle_root_sha3_512_hex": merkle_root.hex(),
        "final_hash_sha3_512_hex": final_hash.hex(),
        "note": "ciphertext stored in filesystem cloud_A/B/C; DB stores nonce/tag/plaintext_hash + placeholder ciphertext",
    }
    _write_manifest_to_clouds(file_id, manifest, clouds)

    send_msg(
        tls_sock,
        MSG_DONE,
        json.dumps(
            {
                "file_id": file_id,
                "status": "AVAILABLE",
                "chunks_total": chunks_total,
                "merkle_root_sha3_512": merkle_root.hex(),
                "final_hash_sha3_512": final_hash.hex(),
            }
        ).encode("utf-8"),
    )
    return file_id
