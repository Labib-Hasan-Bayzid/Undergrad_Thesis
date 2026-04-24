# storage_pipeline.py
from __future__ import annotations

import os, json, math, time, uuid
from pathlib import Path
from typing import Iterable, Callable, Optional

import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

CHUNK_SIZE_DEFAULT = int(os.getenv("CHUNK_SIZE", str(8 * 1024 * 1024)))  # 8MB default

CLOUD_DIRS = ["cloud_A", "cloud_B", "cloud_C"]


def sha3_512(data: bytes) -> bytes:
    h = hashes.Hash(hashes.SHA3_512())
    h.update(data)
    return h.finalize()


def hkdf_sha3_512(ikm: bytes, info: bytes, length: int = 32, salt: Optional[bytes] = None) -> bytes:
    return HKDF(
        algorithm=hashes.SHA3_512(),
        length=length,
        salt=salt,
        info=info,
    ).derive(ikm)


def merkle_root_sha3_512(leaves: list[bytes]) -> bytes:
    if not leaves:
        return sha3_512(b"")
    level = leaves[:]
    while len(level) > 1:
        nxt = []
        for i in range(0, len(level), 2):
            left = level[i]
            right = level[i + 1] if i + 1 < len(level) else left
            nxt.append(sha3_512(left + right))
        level = nxt
    return level[0]


def ensure_dirs(file_id: str) -> None:
    for c in CLOUD_DIRS:
        Path(c, file_id).mkdir(parents=True, exist_ok=True)


def write_chunk_all_clouds(file_id: str, chunk_index: int, ciphertext: bytes) -> None:
    name = f"{chunk_index:08d}.bin"
    for c in CLOUD_DIRS:
        p = Path(c) / file_id / name
        p.write_bytes(ciphertext)


def write_manifest_all_clouds(file_id: str, manifest: dict) -> None:
    payload = json.dumps(manifest, indent=2).encode()
    for c in CLOUD_DIRS:
        p = Path(c) / file_id / "manifest.json"
        p.write_bytes(payload)


def db_touch_activity(cur, file_id: str) -> None:
    cur.execute("UPDATE files SET last_activity_at = now() WHERE file_id=%s::uuid", (file_id,))


def db_create_file(
    cur,
    file_id: str,
    filename: str,
    filesize: int,
    chunk_size: int,
    wrapped_dek: bytes,
    wrap_nonce: bytes,
    kek_version: int,
    kms_rand_wrapped: bytes,
    kms_rand_nonce: bytes,
    session_id: bytes,
    challenge: bytes,
    kdf_info: str,
    hybrid_mode: str,
    tls_binding_mode: str,
) -> None:
    cur.execute(
        """
        INSERT INTO files(
          file_id, filename, file_size, chunk_size,
          chunks_total, uploaded_chunks, status,
          wrapped_dek, wrap_nonce, kek_version,
          kms_rand_wrapped, kms_rand_nonce,
          session_id, challenge,
          kdf_info, hybrid_mode, tls_binding_mode,
          created_at, last_activity_at
        )
        VALUES(
          %s::uuid, %s, %s, %s,
          0, 0, 'IN_PROGRESS',
          %s, %s, %s,
          %s, %s,
          %s, %s,
          %s, %s, %s,
          now(), now()
        )
        """,
        (
            file_id, filename, filesize, chunk_size,
            wrapped_dek, wrap_nonce, kek_version,
            kms_rand_wrapped, kms_rand_nonce,
            session_id, challenge,
            kdf_info, hybrid_mode, tls_binding_mode,
        ),
    )


def db_upsert_chunk_meta(cur, file_id: str, idx: int, chunk_hash: bytes, nonce: bytes, ciphertext_len: int) -> None:
    cur.execute(
        """
        INSERT INTO chunks(file_id, chunk_index, nonce, ciphertext_len, chunk_hash_sha3_512)
        VALUES(%s::uuid, %s, %s, %s, %s)
        ON CONFLICT (file_id, chunk_index) DO UPDATE
        SET nonce = EXCLUDED.nonce,
            ciphertext_len = EXCLUDED.ciphertext_len,
            chunk_hash_sha3_512 = EXCLUDED.chunk_hash_sha3_512
        """,
        (file_id, idx, nonce, ciphertext_len, chunk_hash),
    )


def db_mark_progress(cur, file_id: str, uploaded_chunks: int) -> None:
    cur.execute(
        "UPDATE files SET uploaded_chunks=%s, last_activity_at=now() WHERE file_id=%s::uuid",
        (uploaded_chunks, file_id),
    )


def db_finalize(cur, file_id: str, chunks_total: int, merkle_root: bytes) -> None:
    cur.execute(
        """
        UPDATE files
        SET status='COMPLETE',
            chunks_total=%s,
            merkle_root_sha3_512=%s,
            final_hash_sha3_512=%s,
            last_activity_at=now()
        WHERE file_id=%s::uuid
        """,
        (chunks_total, merkle_root, merkle_root, file_id),
    )


def kms_wrap(conn, plaintext: bytes, actor: str = "SYSTEM") -> tuple[int, bytes, bytes]:
    """
    Wrap plaintext under active KEK using AES-GCM.
    Returns (kek_version, nonce, wrapped_ciphertext).
    """
    with conn.cursor() as cur:
        cur.execute("SELECT kek_version, kek_material FROM kms_keks WHERE active=true LIMIT 1")
        row = cur.fetchone()
        if not row:
            raise RuntimeError("No active KEK in kms_keks")
        kver = int(row[0])
        kek = bytes(row[1])

    nonce = os.urandom(12)
    wrapped = AESGCM(kek).encrypt(nonce, plaintext, None)

    # audit
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO kms_audit(actor, action, details) VALUES(%s,%s,%s::jsonb)",
            (actor, "WRAP", json.dumps({"kek_version": kver, "len": len(plaintext)})),
        )
        conn.commit()

    return kver, nonce, wrapped


def kms_unwrap(conn, kver: int, nonce: bytes, wrapped: bytes, actor: str = "SYSTEM") -> bytes:
    with conn.cursor() as cur:
        cur.execute("SELECT kek_material FROM kms_keks WHERE kek_version=%s LIMIT 1", (kver,))
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"Missing KEK version {kver}")
        kek = bytes(row[0])

    pt = AESGCM(kek).decrypt(nonce, wrapped, None)

    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO kms_audit(actor, action, details) VALUES(%s,%s,%s::jsonb)",
            (actor, "UNWRAP", json.dumps({"kek_version": kver, "len": len(pt)})),
        )
        conn.commit()

    return pt


def derive_dek(hybrid_session_secret: bytes, kms_rand: bytes) -> bytes:
    # This is your requested design:
    # DEK = HKDF-SHA3-512(hybrid_session_secret || kms_rand, info="pqc-vault-dek-v2", length=32)
    ikm = hybrid_session_secret + kms_rand
    return hkdf_sha3_512(ikm, info=b"pqc-vault-dek-v2", length=32)


def stream_encrypt_store_finalize(
    conn: psycopg.Connection,
    filename: str,
    filesize: int,
    session_id: bytes,
    challenge: bytes,
    hybrid_session_secret: bytes,
    tls_binding_mode: str,
    hybrid_mode: str,
    recv_bytes_iter: Iterable[bytes],
    chunk_size: int = CHUNK_SIZE_DEFAULT,
    actor: str = "tls_client",
) -> str:
    file_id = str(uuid.uuid4())
    ensure_dirs(file_id)

    # KMS randomness per file (not secret long-term by itself, but we still protect it)
    kms_rand = os.urandom(32)

    dek = derive_dek(hybrid_session_secret, kms_rand)

    # Wrap DEK and wrap kms_rand (industry audit/forensics)
    kek_version, wrap_nonce, wrapped_dek = kms_wrap(conn, dek, actor=actor)
    _, kms_rand_nonce, kms_rand_wrapped = kms_wrap(conn, kms_rand, actor=actor)

    kdf_info = "HKDF-SHA3-512(hybrid_session_secret||kms_rand, info=pqc-vault-dek-v2)"

    with conn.cursor() as cur:
        db_create_file(
            cur,
            file_id=file_id,
            filename=filename,
            filesize=filesize,
            chunk_size=chunk_size,
            wrapped_dek=wrapped_dek,
            wrap_nonce=wrap_nonce,
            kek_version=kek_version,
            kms_rand_wrapped=kms_rand_wrapped,
            kms_rand_nonce=kms_rand_nonce,
            session_id=session_id,
            challenge=challenge,
            kdf_info=kdf_info,
            hybrid_mode=hybrid_mode,
            tls_binding_mode=tls_binding_mode,
        )
        conn.commit()

    aes = AESGCM(dek)
    leaves: list[bytes] = []
    uploaded = 0

    # stream chunker
    buf = bytearray()
    chunk_index = 0

    def flush_one(plaintext: bytes) -> None:
        nonlocal chunk_index, uploaded
        nonce = os.urandom(12)

        # AAD binds ciphertext to file_id + chunk index (integrity domain separation)
        aad = f"{file_id}:{chunk_index}".encode()

        ciphertext = aes.encrypt(nonce, plaintext, aad)
        write_chunk_all_clouds(file_id, chunk_index, ciphertext)

        chash = sha3_512(ciphertext)
        leaves.append(chash)

        with conn.cursor() as cur:
            db_upsert_chunk_meta(cur, file_id, chunk_index, chash, nonce, len(ciphertext))
            uploaded = chunk_index + 1
            db_mark_progress(cur, file_id, uploaded)
            conn.commit()

        chunk_index += 1

    for piece in recv_bytes_iter:
        buf.extend(piece)
        while len(buf) >= chunk_size:
            part = bytes(buf[:chunk_size])
            del buf[:chunk_size]
            flush_one(part)

    if buf:
        flush_one(bytes(buf))

    chunks_total = chunk_index
    root = merkle_root_sha3_512(leaves)

    with conn.cursor() as cur:
        db_finalize(cur, file_id, chunks_total, root)
        conn.commit()

    manifest = {
        "file_id": file_id,
        "filename": filename,
        "filesize": filesize,
        "chunk_size": chunk_size,
        "chunks_total": chunks_total,
        "merkle_root_sha3_512_hex": root.hex(),
        "final_hash_sha3_512_hex": root.hex(),
        "kek_version": kek_version,
        "wrapped_dek_hex": wrapped_dek.hex(),
        "wrap_nonce_hex": wrap_nonce.hex(),
        "kms_rand_wrapped_hex": kms_rand_wrapped.hex(),
        "kms_rand_nonce_hex": kms_rand_nonce.hex(),
        "kdf_info": kdf_info,
        "hybrid_evidence": {
            "session_id_hex": session_id.hex(),
            "challenge_hex": challenge.hex(),
            "hybrid_mode": hybrid_mode,
            "tls_binding_mode": tls_binding_mode,
        },
    }
    write_manifest_all_clouds(file_id, manifest)
    return file_id
