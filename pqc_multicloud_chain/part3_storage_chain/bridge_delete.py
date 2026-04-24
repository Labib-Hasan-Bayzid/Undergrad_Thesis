from __future__ import annotations

import json
import os
import shutil
import argparse
import psycopg


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file-id", required=True)
    args = ap.parse_args()

    file_id = args.file_id.strip()
    if not file_id:
        raise RuntimeError("Missing file id")

    dsn = os.environ.get("DB_DSN") or os.environ.get("PG_DSN")
    if not dsn:
        host = os.environ.get("PGHOST", "127.0.0.1")
        port = os.environ.get("PGPORT", "5432")
        db = os.environ.get("PGDATABASE", "pqc_vault")
        user = os.environ.get("PGUSER", "postgres")
        pw = os.environ.get("PGPASSWORD", "")
        dsn = f"postgresql://{user}:{pw}@{host}:{port}/{db}"

    cloud_dirs = [
        os.environ.get("CLOUD_A", "cloud_A"),
        os.environ.get("CLOUD_B", "cloud_B"),
        os.environ.get("CLOUD_C", "cloud_C"),
    ]

    deleted_paths = []

    for base in cloud_dirs:
        p = os.path.join(base, file_id)
        if os.path.exists(p):
            shutil.rmtree(p, ignore_errors=True)
            deleted_paths.append(p)

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            # delete child rows first
            try:
                cur.execute("DELETE FROM file_chunks WHERE file_id=%s::uuid", (file_id,))
            except Exception:
                conn.rollback()
                with conn.cursor() as cur2:
                    # fallback if file_id column isn't castable this way in schema
                    cur2.execute("DELETE FROM file_chunks WHERE file_id=%s", (file_id,))

            try:
                cur.execute("DELETE FROM chunks WHERE file_id=%s::uuid", (file_id,))
            except Exception:
                conn.rollback()

            try:
                cur.execute("DELETE FROM replicas WHERE file_id=%s::uuid", (file_id,))
            except Exception:
                conn.rollback()

            try:
                cur.execute("DELETE FROM integrity_events WHERE file_id=%s::uuid", (file_id,))
            except Exception:
                conn.rollback()

            try:
                cur.execute("DELETE FROM upload_sessions WHERE file_id=%s::uuid", (file_id,))
            except Exception:
                conn.rollback()

            # delete main file row
            try:
                cur.execute("DELETE FROM files WHERE file_id=%s::uuid", (file_id,))
            except Exception:
                conn.rollback()
                with conn.cursor() as cur2:
                    cur2.execute("DELETE FROM files WHERE file_id=%s", (file_id,))

        conn.commit()

    print(json.dumps({
        "ok": True,
        "fileId": file_id,
        "deletedPaths": deleted_paths,
    }))


if __name__ == "__main__":
    main()
