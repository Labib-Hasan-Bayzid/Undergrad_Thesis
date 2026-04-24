#!/usr/bin/env python3
import os, json, math, uuid
from pathlib import Path
from typing import Dict, Any, Tuple, Optional

import psycopg
from psycopg.rows import dict_row

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import hashlib
import secrets

DB_DSN = os.getenv("DB_DSN", "host=127.0.0.1 port=5432 dbname=pqc_vault user=abdullahadnan")
ACTOR = os.getenv("ACTOR", "SYSTEM")

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE_BYTES", str(8 * 1024 * 1024)))  # 8MB default
CLOUD_DIRS = ["cloud_A", "cloud_B", "cloud_C"]


# ---------------- KMS helpers ----------------

def kms_get_active_kek(conn) -> Tuple[int, bytes]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT kek_version, kek_material FROM kms_keks WHERE active=true ORDER BY kek_version DESC LIMIT 1;")
        row = cur.fetchone()
        if not row:
            raise RuntimeError("No active KEK found in kms_keks. Run: python kms_bootstrap.py")
        return int(row["kek_version"]), bytes(row["kek_material"])

def kms_get_kek_by_version(conn, version: int) -> bytes:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT kek_material FROM kms_keks WHERE kek_version=%s;", (version,))
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"KEK version {version} not found.")
        return bytes(row["kek_material"])

def kms_audit(conn, actor: str, action: str, details: Dict[str, Any]) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO kms_audit(actor, action, details) VALUES (%s, %s, %s::jsonb);",
            (actor, action, json.dumps(details)),
        )

def kms_wrap_dek(conn, dek: bytes, aad: bytes) -> Tuple[int, bytes, bytes]:
    kek_version, kek = kms_get_active_kek(conn)
    nonce = secrets.token_bytes(12)
    wrapped = AESGCM(kek).encrypt(nonce, dek, aad)
    kms_audit(conn, ACTOR, "WRAP_DEK", {"kek_version": kek_version})
    return kek_version, wrapped, nonce

def kms_unwrap_dek(conn, kek_version: int, wrapped: bytes, wrap_nonce: bytes, aad: bytes) -> bytes:
    kek = kms_get_kek_by_version(conn, kek_version)
    dek = AESGCM(kek).decrypt(wrap_nonce, wrapped, aad)
    kms_audit(conn, ACTOR, "UNWRAP_DEK", {"kek_version": kek_version})
    return dek


# ---------------- Hash / Merkle helpers ----------------

def sha3_512(data: bytes) -> bytes:
    return hashlib.sha3_512(data).digest()


# ---------------- Cloud helpers ----------------

def ensure_cloud_dirs():
    for c in CLOUD_DIRS:
        Path(c).mkdir(parents=True, exist_ok=True)

def cloud_write_chunk(file_id: str, idx: int, ciphertext: bytes) -> None:
    for c in CLOUD_DIRS:
        p = Path(c) / file_id
        p.mkdir(parents=True, exist_ok=True)
        (p / f"{idx:08d}.bin").write_bytes(ciphertext)

def cloud_write_manifest(file_id: str, manifest: Dict[str, Any]) -> None:
    for c in CLOUD_DIRS:
        p = Path(c) / file_id
        p.mkdir(parents=True, exist_ok=True)
        (p / "manifest.json").write_text(json.dumps(manifest, indent=2))


# ---------------- DB helpers ----------------

def db_create_file(conn, file_id: str, filename: str, file_size: int, chunk_size: int, chunks_total: int,
                   wrapped_dek: bytes, wrap_nonce: bytes, kek_version: int) -> None:

    # If your schema keeps salt NOT NULL, keep this random salt forever for that row.
    salt = secrets.token_bytes(16)

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO files(
                file_id, filename, file_size, chunk_size,
                chunks_total, uploaded_chunks, status,
                salt,
                wrapped_dek, wrap_nonce, kek_version,
                kdf, enc,
                created_at, last_activity_at
            )
            VALUES (
                %s, %s, %s, %s,
                %s, 0, 'IN_PROGRESS',
                %s,
                %s, %s, %s,
                'kms-wrap-v1', 'aes-256-gcm',
                now(), now()
            );
        """, (file_id, filename, file_size, chunk_size,
              chunks_total, salt,
              wrapped_dek, wrap_nonce, kek_version))

def db_get_file_resume_info(conn, file_id: str) -> Optional[Dict[str, Any]]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("""
            SELECT file_id, filename, file_size, chunk_size, chunks_total, uploaded_chunks,
                   wrapped_dek, wrap_nonce, kek_version, status
            FROM files WHERE file_id=%s;
        """, (file_id,))
        return cur.fetchone()

def db_upsert_chunk_meta(conn, file_id: str, idx: int, nonce: bytes, ciphertext_len: int, chunk_hash: bytes, size: int) -> None:
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO chunks(file_id, chunk_index, nonce, ciphertext_len, chunk_hash_sha3_512, size)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (file_id, chunk_index)
            DO UPDATE SET nonce=EXCLUDED.nonce,
                          ciphertext_len=EXCLUDED.ciphertext_len,
                          chunk_hash_sha3_512=EXCLUDED.chunk_hash_sha3_512,
                          size=EXCLUDED.size;
        """, (file_id, idx, nonce, ciphertext_len, chunk_hash, size))

def db_set_uploaded_chunks(conn, file_id: str, uploaded_chunks: int) -> None:
    # IMPORTANT PATCH (industry-safe):
    # Always touch last_activity_at after every chunk commit.
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE files
            SET uploaded_chunks=%s,
                last_activity_at=now()
            WHERE file_id=%s;
        """, (uploaded_chunks, file_id))


# ---------------- Main ----------------

def main():
    ensure_cloud_dirs()

    mode = input("Mode (new/resume): ").strip().lower()
    crash_at_str = input("Simulate crash at chunk index? (blank for none): ").strip()
    crash_at = int(crash_at_str) if crash_at_str else None

    file_path_str = input("File path to upload: ").strip()
    in_path = Path(file_path_str).expanduser()
    if not in_path.exists() or not in_path.is_file():
        print("File not found.")
        return

    if mode == "new":
        file_id = str(uuid.uuid4())
        filename = in_path.name
        file_size = in_path.stat().st_size
        chunks_total = math.ceil(file_size / CHUNK_SIZE)

        with psycopg.connect(DB_DSN) as conn:
            conn.execute("SET TIME ZONE 'UTC';")

            dek = secrets.token_bytes(32)
            aad = f"file:{file_id}".encode()
            kek_version, wrapped_dek, wrap_nonce = kms_wrap_dek(conn, dek, aad)

            db_create_file(conn, file_id, filename, file_size, CHUNK_SIZE, chunks_total,
                           wrapped_dek, wrap_nonce, kek_version)

        start_chunk = 0

    elif mode == "resume":
        file_id = input("Enter file_id to resume: ").strip()

        with psycopg.connect(DB_DSN) as conn:
            conn.execute("SET TIME ZONE 'UTC';")
            row = db_get_file_resume_info(conn, file_id)
            if not row:
                print("No such file_id in DB.")
                return
            start_chunk = int(row["uploaded_chunks"])
            filename = row["filename"]
            file_size = int(row["file_size"])
            chunks_total = int(row["chunks_total"])

    else:
        print("Invalid mode.")
        return

    # Load resume info
    with psycopg.connect(DB_DSN) as conn:
        conn.execute("SET TIME ZONE 'UTC';")
        row = db_get_file_resume_info(conn, file_id)
        if not row:
            print("No such file_id in DB.")
            return

        chunk_size = int(row["chunk_size"])
        chunks_total = int(row["chunks_total"])
        uploaded_chunks_db = int(row["uploaded_chunks"])
        kek_version = int(row["kek_version"])
        wrapped_dek = bytes(row["wrapped_dek"])
        wrap_nonce = bytes(row["wrap_nonce"])

        aad = f"file:{file_id}".encode()
        dek = kms_unwrap_dek(conn, kek_version, wrapped_dek, wrap_nonce, aad)
        aes = AESGCM(dek)

        print("\n--- Resume info ---")
        print("file_id:", file_id)
        print("starting from chunk:", start_chunk)
        print("chunk_size:", chunk_size)

        # Upload from start_chunk
        with in_path.open("rb") as f:
            # Skip already uploaded chunks
            f.seek(start_chunk * chunk_size)

            uploaded = start_chunk
            for idx in range(start_chunk, chunks_total):
                plaintext = f.read(chunk_size)
                if not plaintext:
                    break

                nonce = secrets.token_bytes(12)
                chunk_aad = f"{file_id}:{idx}".encode()
                ciphertext = aes.encrypt(nonce, plaintext, chunk_aad)

                cloud_write_chunk(file_id, idx, ciphertext)

                chash = sha3_512(ciphertext)
                db_upsert_chunk_meta(conn, file_id, idx, nonce, len(ciphertext), chash, len(plaintext))

                uploaded += 1
                db_set_uploaded_chunks(conn, file_id, uploaded)

                print(f"uploaded chunk {idx}")

                if crash_at is not None and idx == crash_at:
                    print(f"\n💥 Simulated crash at chunk {idx}. Now run in resume mode.")
                    print("file_id:", file_id)
                    return

        # Write manifest (still IN_PROGRESS here; finalize_upload will mark COMPLETE)
        manifest = {
            "file_id": file_id,
            "filename": row["filename"],
            "file_size": int(row["file_size"]),
            "chunk_size": chunk_size,
            "chunks_total": chunks_total,
            "uploaded_chunks": uploaded,
            "status": "IN_PROGRESS",
            "enc": "aes-256-gcm",
            "kdf": "kms-wrap-v1",
            "kek_version": kek_version,
        }
        cloud_write_manifest(file_id, manifest)

        print("\n✅ Upload finished (still IN_PROGRESS)")
        print("Now run: python finalize_upload.py")
        print("file_id:", file_id)


if __name__ == "__main__":
    main()
