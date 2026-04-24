# finalize_upload.py (FINAL) - builds Merkle from ciphertext hashes stored in DB (chunks.chunk_hash_sha3_512)
# and writes the final Merkle root + status COMPLETE into files table.

from __future__ import annotations
import os
from pathlib import Path
from typing import List

import psycopg
from cryptography.hazmat.primitives import hashes

try:
    from config import DB_DSN
except Exception:
    DB_DSN = "host=127.0.0.1 port=5432 dbname=pqc_vault user=abdullahadnan"


def sha3_512(data: bytes) -> bytes:
    h = hashes.Hash(hashes.SHA3_512())
    h.update(data)
    return h.finalize()


def merkle_root_sha3_512(leaves: List[bytes]) -> bytes:
    """
    Merkle root of a list of leaf hashes.
    If odd number of nodes at a level, duplicate last node.
    Node hash = SHA3-512(left || right)
    """
    if not leaves:
        return sha3_512(b"")  # empty case (should not happen for real files)

    level = leaves[:]
    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])
        next_level = []
        for i in range(0, len(level), 2):
            next_level.append(sha3_512(level[i] + level[i + 1]))
        level = next_level
    return level[0]


def main():
    file_id = input("Enter file_id to finalize: ").strip()

    with psycopg.connect(DB_DSN) as conn:
        with conn.cursor() as cur:
            # Get upload state
            cur.execute(
                """
                SELECT filename, file_size, chunk_size, uploaded_chunks, status
                FROM files
                WHERE file_id=%s
                """,
                (file_id,),
            )
            row = cur.fetchone()
            if not row:
                raise SystemExit("file_id not found.")
            filename, file_size, chunk_size, uploaded_chunks, status = row

            if status != "IN_PROGRESS":
                raise SystemExit(f"Cannot finalize: status is {status}")

            if uploaded_chunks is None or int(uploaded_chunks) == 0:
                raise SystemExit("No chunks uploaded, cannot finalize.")

            chunks_total = int(uploaded_chunks)

            # Load ciphertext-hashes from DB (these must be SHA3(ciphertext) for each chunk)
            cur.execute(
                """
                SELECT chunk_index, chunk_hash_sha3_512
                FROM chunks
                WHERE file_id=%s
                ORDER BY chunk_index ASC
                """,
                (file_id,),
            )
            rows = cur.fetchall()
            if len(rows) != chunks_total:
                raise SystemExit(
                    f"DB chunks count mismatch. expected {chunks_total}, got {len(rows)}"
                )

            # Ensure contiguous indices: 0..chunks_total-1
            for idx, (chunk_index, _) in enumerate(rows):
                if int(chunk_index) != idx:
                    raise SystemExit(
                        f"Chunk index mismatch at position {idx}. Found {chunk_index}"
                    )

            leaf_hashes = [r[1] for r in rows]  # already bytes
            root = merkle_root_sha3_512(leaf_hashes)

            # Optional: final hash (same as root here, you can keep separate if you want later)
            final_hash = root

            # Update files row
            cur.execute(
                """
                UPDATE files
                SET status='COMPLETE',
                    chunks_total=%s,
                    merkle_root_sha3_512=%s,
                    final_hash_sha3_512=%s,
                    last_activity_at=now()
                WHERE file_id=%s
                """,
                (chunks_total, root, final_hash, file_id),
            )

        conn.commit()

    print("✅ Finalized upload")
    print("chunks_total:", chunks_total)
    print("merkle_root:", root.hex())


if __name__ == "__main__":
    main()
