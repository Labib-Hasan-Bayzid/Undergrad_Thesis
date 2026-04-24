# lifecycle.py
from __future__ import annotations

import math
from typing import List, Tuple
import psycopg

from merkle_utils import build_merkle_root_sha3_512
from crypto_utils import sha3_512

CLOUDS_DEFAULT = ("cloud_A", "cloud_B", "cloud_C")

def expected_chunks(file_size: int, chunk_size: int) -> int:
    if file_size <= 0:
        raise ValueError("file_size must be > 0")
    if chunk_size <= 0:
        raise ValueError("chunk_size must be > 0")
    return int(math.ceil(file_size / chunk_size))

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

def finalize_file_atomic(
    conn: psycopg.Connection,
    file_id: str,
    clouds: Tuple[str, ...] = CLOUDS_DEFAULT,
) -> Tuple[bytes, bytes]:
    """
    Atomic + idempotent finalize:
      - locks file row
      - if already AVAILABLE: return stored roots
      - checks all chunks exist per cloud
      - checks per-index hashes match across clouds
      - computes merkle_root + final_hash
      - sets status AVAILABLE
    Returns (merkle_root, final_hash)
    """
    with conn.transaction():
        cur = conn.cursor()

        # Lock the file row
        cur.execute(
            """
            SELECT file_id, file_size, chunk_size, chunks_total, status,
                   merkle_root_sha3_512, final_hash_sha3_512
            FROM files
            WHERE file_id = %s
            FOR UPDATE
            """,
            (file_id,),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError("FILE_NOT_FOUND")

        _, file_size, chunk_size, chunks_total, status, merkle_db, final_db = row

        # Idempotent: if already AVAILABLE and roots exist, return them
        if status == "AVAILABLE" and merkle_db is not None and final_db is not None:
            return merkle_db, final_db

        # If chunks_total missing (older rows), compute and write it
        if chunks_total is None:
            chunks_total = expected_chunks(int(file_size), int(chunk_size))
            cur.execute(
                "UPDATE files SET chunks_total=%s WHERE file_id=%s",
                (chunks_total, file_id),
            )

        if int(chunks_total) <= 0:
            raise RuntimeError("BAD_CHUNK_COUNT")

        # Count chunks per cloud must match chunks_total
        for cloud in clouds:
            cur.execute(
                """
                SELECT COUNT(*)
                FROM file_chunks
                WHERE file_id=%s AND cloud_id=%s
                """,
                (file_id, cloud),
            )
            n = int(cur.fetchone()[0])
            if n != int(chunks_total):
                raise RuntimeError(f"MISSING_CHUNKS:{cloud}:{n}/{chunks_total}")

        # Fetch hashes (ordered) for each cloud
        def fetch_hashes(cloud: str) -> List[bytes]:
            cur.execute(
                """
                SELECT hash_sha3_512
                FROM file_chunks
                WHERE file_id=%s AND cloud_id=%s
                ORDER BY chunk_index ASC
                """,
                (file_id, cloud),
            )
            return [r[0] for r in cur.fetchall()]

        base_hashes = fetch_hashes(clouds[0])
        if not base_hashes:
            raise RuntimeError("NO_CHUNKS_RECEIVED")

        # Cross-cloud consistency check
        for cloud in clouds[1:]:
            other = fetch_hashes(cloud)
            if len(other) != len(base_hashes):
                raise RuntimeError(f"HASH_MISMATCH_LEN:{cloud}")
            for i, (a, b) in enumerate(zip(base_hashes, other)):
                if a != b:
                    raise RuntimeError(f"HASH_MISMATCH:{cloud}:idx={i}")

        merkle_root = build_merkle_root_sha3_512(base_hashes)
        final_hash = sha3_512(b"".join(base_hashes))

        # Build UPDATE dynamically (only existing columns)
        sets = [
            "merkle_root_sha3_512=%s",
            "final_hash_sha3_512=%s",
            "uploaded_chunks=%s",
            "status='AVAILABLE'",
        ]
        params = [merkle_root, final_hash, int(chunks_total)]

        if _has_column(conn, "files", "finalized_at"):
            sets.append("finalized_at=now()")
        if _has_column(conn, "files", "available_at"):
            sets.append("available_at=now()")

        sql = f"UPDATE files SET {', '.join(sets)} WHERE file_id=%s"
        params.append(file_id)

        cur.execute(sql, tuple(params))
        return merkle_root, final_hash
