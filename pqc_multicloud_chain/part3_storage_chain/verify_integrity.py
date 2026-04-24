import psycopg
from merkle_utils import build_merkle_root_sha3_512

def main():
    conn = psycopg.connect(
        host="127.0.0.1",
        port=5432,
        dbname="pqc_vault",
        user="abdullahadnan",
    )

    ok = True

    with conn.cursor() as cur:
        cur.execute("""
            SELECT file_id, merkle_root_sha3_512, chunks_total
            FROM files
            WHERE status='AVAILABLE'
        """)
        files = cur.fetchall()

        for file_id, stored_root, chunks_total in files:
            cur.execute("""
                SELECT hash_sha3_512
                FROM file_chunks
                WHERE file_id=%s
                ORDER BY chunk_index ASC
            """, (file_id,))
            hashes = [r[0] for r in cur.fetchall()]

            if len(hashes) != chunks_total:
                print(f"❌ {file_id}: chunk count mismatch")
                ok = False
                continue

            calc_root = build_merkle_root_sha3_512(hashes)
            if calc_root != stored_root:
                print(f"❌ {file_id}: MERKLE MISMATCH")
                ok = False
            else:
                print(f"✅ {file_id}: integrity OK")

    conn.close()

    if not ok:
        raise SystemExit("🚨 Integrity verification FAILED")

    print("🎉 All files verified successfully")

if __name__ == "__main__":
    main()
