from __future__ import annotations

import os
import psycopg

from merkle_utils import build_merkle_root_sha3_512
from crypto_utils import sha3_512

CLOUDS_DEFAULT = ("cloud_A", "cloud_B", "cloud_C")

def db_connect():
    return psycopg.connect(
        host=os.getenv("PGHOST", "127.0.0.1"),
        port=int(os.getenv("PGPORT", "5432")),
        dbname=os.getenv("PGDATABASE", "pqc_vault"),
        user=os.getenv("PGUSER", "abdullahadnan"),
        password=os.getenv("PGPASSWORD", ""),
        autocommit=True,
    )

def fetch_hashes(cur, file_id: str, cloud_id: str):
    cur.execute(
        """
        SELECT chunk_index, hash_sha3_512
        FROM file_chunks
        WHERE file_id=%s AND cloud_id=%s
        ORDER BY chunk_index ASC
        """,
        (file_id, cloud_id),
    )
    return cur.fetchall()

def main():
    rebuild_cloud = os.getenv("REBUILD_CLOUD", "cloud_A").strip() or "cloud_A"
    strict = os.getenv("REBUILD_STRICT", "1").strip() != "0"
    clouds = CLOUDS_DEFAULT

    conn = db_connect()
    with conn.cursor() as cur:
        # rebuild for ALL files; you can filter by ONLY_MISSING=1 if you want
        only_missing = os.getenv("ONLY_MISSING", "0").strip() == "1"
        if only_missing:
            cur.execute("""
                SELECT file_id, chunks_total FROM files WHERE status='AVAILABLE' AND chunks_total > 0
                WHERE merkle_root_sha3_512 IS NULL OR final_hash_sha3_512 IS NULL
                ORDER BY created_at DESC
            """)
        else:
            cur.execute("""
                SELECT file_id, chunks_total FROM files WHERE status='AVAILABLE' AND chunks_total > 0
                ORDER BY created_at DESC
            """)
        files = cur.fetchall()

    print(f"🔍 Rebuilding Merkle roots for {len(files)} files using cloud={rebuild_cloud} strict={strict}")

    ok = 0
    skipped = 0
    failed = 0

    for (file_id, chunks_total) in files:
        file_id = str(file_id)
        chunks_total = int(chunks_total or 0)
        if chunks_total <= 0:
            print(f"❌ {file_id}: BAD chunks_total={chunks_total}")
            failed += 1
            continue

        with conn.transaction():
            cur = conn.cursor()

            # lock file row (avoid race)
            cur.execute("SELECT file_id FROM files WHERE file_id=%s FOR UPDATE", (file_id,))
            if not cur.fetchone():
                skipped += 1
                continue

            base = fetch_hashes(cur, file_id, rebuild_cloud)

            if len(base) != chunks_total:
                print(f"❌ {file_id}: chunk count mismatch in {rebuild_cloud} ({len(base)}/{chunks_total})")
                failed += 1
                continue

            # verify indexes are contiguous
            for i, (idx, h) in enumerate(base):
                if idx != i:
                    print(f"❌ {file_id}: CHUNK_INDEX_MISMATCH expected={i} got={idx} in {rebuild_cloud}")
                    failed += 1
                    break
            else:
                # optional strict cross-cloud hash equality
                if strict:
                    base_hashes = [h for (_, h) in base]
                    for c in clouds:
                        if c == rebuild_cloud:
                            continue
                        other = fetch_hashes(cur, file_id, c)
                        if len(other) != chunks_total:
                            print(f"❌ {file_id}: cloud {c} count mismatch ({len(other)}/{chunks_total})")
                            failed += 1
                            break
                        other_hashes = [h for (_, h) in other]
                        if other_hashes != base_hashes:
                            print(f"❌ {file_id}: HASH_MISMATCH across clouds (base={rebuild_cloud}, other={c})")
                            failed += 1
                            break
                    else:
                        # rebuild
                        merkle = build_merkle_root_sha3_512(base_hashes)
                        final_hash = sha3_512(b"".join(base_hashes))
                        cur.execute(
                            """
                            UPDATE files
                            SET merkle_root_sha3_512=%s,
                                final_hash_sha3_512=%s
                            WHERE file_id=%s
                            """,
                            (merkle, final_hash, file_id),
                        )
                        print(f"✅ Rebuilt Merkle+FinalHash for {file_id}")
                        ok += 1
                    continue

                # non-strict rebuild
                base_hashes = [h for (_, h) in base]
                merkle = build_merkle_root_sha3_512(base_hashes)
                final_hash = sha3_512(b"".join(base_hashes))
                cur.execute(
                    """
                    UPDATE files
                    SET merkle_root_sha3_512=%s,
                        final_hash_sha3_512=%s
                    WHERE file_id=%s
                    """,
                    (merkle, final_hash, file_id),
                )
                print(f"✅ Rebuilt Merkle+FinalHash for {file_id}")
                ok += 1

    conn.close()
    print(f"\n🎯 Merkle rebuild complete. ok={ok} failed={failed} skipped={skipped}")

if __name__ == "__main__":
    main()
