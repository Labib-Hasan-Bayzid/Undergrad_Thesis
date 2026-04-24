# verify_multicloud.py (FINAL) - verifies ciphertext stored in each cloud using DB chunk hashes + DB Merkle root

from __future__ import annotations
import os
from pathlib import Path
from typing import List, Tuple

import psycopg
from cryptography.hazmat.primitives import hashes

try:
    from config import DB_DSN, CLOUD_DIRS
except Exception:
    DB_DSN = "host=127.0.0.1 port=5432 dbname=pqc_vault user=abdullahadnan"
    CLOUD_DIRS = ("cloud_A", "cloud_B", "cloud_C")


def sha3_512(data: bytes) -> bytes:
    h = hashes.Hash(hashes.SHA3_512())
    h.update(data)
    return h.finalize()


def merkle_root_sha3_512(leaves: List[bytes]) -> bytes:
    if not leaves:
        return sha3_512(b"")
    level = leaves[:]
    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])
        nxt = []
        for i in range(0, len(level), 2):
            nxt.append(sha3_512(level[i] + level[i + 1]))
        level = nxt
    return level[0]


def chunk_filename(chunk_index: int) -> str:
    return f"{chunk_index:08d}.bin"


def load_db_expectations(conn, file_id: str) -> Tuple[int, bytes, List[bytes]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT status, chunks_total, merkle_root_sha3_512
            FROM files
            WHERE file_id=%s
            """,
            (file_id,),
        )
        row = cur.fetchone()
        if not row:
            raise SystemExit("file_id not found.")
        status, chunks_total, merkle_root = row

        if status != "COMPLETE":
            raise SystemExit(f"File status is {status}. Run finalize_upload.py first.")

        if chunks_total is None or int(chunks_total) <= 0:
            raise SystemExit("Invalid chunks_total in DB.")

        if merkle_root is None:
            raise SystemExit("No merkle_root_sha3_512 in DB. Finalization missing.")

        chunks_total = int(chunks_total)

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
                f"DB chunk rows mismatch. expected {chunks_total}, got {len(rows)}"
            )

        # Ensure contiguous
        for idx, (chunk_index, _) in enumerate(rows):
            if int(chunk_index) != idx:
                raise SystemExit(f"DB chunk_index mismatch: expected {idx}, got {chunk_index}")

        expected_leaf_hashes = [r[1] for r in rows]  # bytes
        return chunks_total, merkle_root, expected_leaf_hashes


def verify_cloud(file_id: str, cloud_dir: str, chunks_total: int,
                 expected_root: bytes, expected_leaf_hashes: List[bytes]) -> Tuple[bytes, List[str]]:
    issues = []
    base = Path(cloud_dir) / file_id
    if not base.exists():
        return b"", [f"{cloud_dir}: missing folder {base}"]

    computed_leaf_hashes = []
    for i in range(chunks_total):
        fp = base / chunk_filename(i)
        if not fp.exists():
            issues.append(f"{cloud_dir}: missing chunk file {fp.name}")
            computed_leaf_hashes.append(sha3_512(b""))  # placeholder to keep indexing
            continue

        ct = fp.read_bytes()
        h = sha3_512(ct)  # ✅ ciphertext hash
        computed_leaf_hashes.append(h)

        if h != expected_leaf_hashes[i]:
            issues.append(f"{cloud_dir}: chunk {i} hash mismatch")

    computed_root = merkle_root_sha3_512(computed_leaf_hashes)

    if computed_root != expected_root:
        issues.append(f"{cloud_dir}: merkle root mismatch")

    return computed_root, issues


def main():
    file_id = input("Enter file_id: ").strip()

    with psycopg.connect(DB_DSN) as conn:
        chunks_total, expected_root, expected_leaf_hashes = load_db_expectations(conn, file_id)

    print("\n=== Per-cloud status ===\n")
    all_roots = {}

    any_fail = False
    for cd in CLOUD_DIRS:
        computed_root, issues = verify_cloud(file_id, cd, chunks_total, expected_root, expected_leaf_hashes)
        all_roots[cd] = computed_root

        print(f"[{cd}] expected_chunks={chunks_total}")
        print("expected root :", expected_root.hex())
        print("computed root :", computed_root.hex() if computed_root else None)

        if issues:
            any_fail = True
            print("issues:")
            for x in issues:
                print(" -", x)
        else:
            print("issues: none ✅")
        print()

    # Consistency across clouds
    roots = [r for r in all_roots.values() if r]
    consistent = (len(set(roots)) == 1) if roots else False

    if any_fail or not consistent:
        print("❌ VERIFICATION FAILED")
        if roots and not consistent:
            print("❌ Clouds are not consistent with each other.")
    else:
        print("✅ ALL CLOUDS VERIFIED (valid + consistent)")


if __name__ == "__main__":
    main()
