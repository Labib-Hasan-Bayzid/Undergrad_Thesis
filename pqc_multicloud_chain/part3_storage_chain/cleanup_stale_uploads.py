# cleanup_stale_uploads.py
from __future__ import annotations

import os
import json
import shutil
from datetime import timedelta

import psycopg

from config import DB_DSN, CLOUD_DIRS


def env_int(name: str, default: int) -> int:
    v = os.getenv(name, "").strip()
    if not v:
        return default
    try:
        return int(v)
    except ValueError:
        raise SystemExit(f"{name} must be an integer, got: {v}")


def env_bool(name: str, default: bool) -> bool:
    v = os.getenv(name, "").strip().lower()
    if not v:
        return default
    return v in ("1", "true", "yes", "y", "on")


def has_column(conn, table: str, column: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema='public'
              AND table_name=%s
              AND column_name=%s
            """,
            (table, column),
        )
        return cur.fetchone() is not None


def delete_cloud_artifacts(file_id: str, dry_run: bool) -> list[str]:
    deleted = []
    for cd in CLOUD_DIRS:
        path = os.path.join(cd, file_id)
        if os.path.exists(path):
            if dry_run:
                deleted.append(f"[DRY] would delete {path}")
            else:
                shutil.rmtree(path, ignore_errors=True)
                deleted.append(f"deleted {path}")
        else:
            deleted.append(f"missing {path} (ok)")
    return deleted


def main():
    # Configure behavior
    stale_minutes = env_int("STALE_MINUTES", 60)   # default: 60 minutes
    dry_run = env_bool("DRY_RUN", True)            # default: True (safe)
    hard_delete_file_row = env_bool("HARD_DELETE_FILE_ROW", False)  # keep metadata by default

    print("=== Cleanup stale uploads ===")
    print("STALE_MINUTES:", stale_minutes)
    print("DRY_RUN:", dry_run)
    print("HARD_DELETE_FILE_ROW:", hard_delete_file_row)
    print()

    with psycopg.connect(DB_DSN) as conn:
        # pick last_activity_at if present, else created_at
        use_last_activity = has_column(conn, "files", "last_activity_at")
        ts_col = "last_activity_at" if use_last_activity else "created_at"

        # Find stale IN_PROGRESS
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT file_id, filename, status, uploaded_chunks, created_at, {ts_col}
                FROM files
                WHERE status='IN_PROGRESS'
                  AND now() - {ts_col} > (%s || ' minutes')::interval
                ORDER BY {ts_col} ASC
                """,
                (stale_minutes,),
            )
            rows = cur.fetchall()

        if not rows:
            print("✅ No stale IN_PROGRESS uploads found.")
            return

        print(f"Found {len(rows)} stale upload(s):")
        for r in rows:
            file_id, filename, status, uploaded_chunks, created_at, activity_at = r
            print(f" - {file_id} | {filename} | uploaded_chunks={uploaded_chunks} | last_activity={activity_at}")
        print()

        for r in rows:
            file_id, filename, status, uploaded_chunks, created_at, activity_at = r

            print(f"--- Cleaning file_id: {file_id} ---")

            # 1) delete cloud files
            cloud_actions = delete_cloud_artifacts(str(file_id), dry_run)
            for a in cloud_actions:
                print(" ", a)

            if dry_run:
                print("  [DRY] would delete chunks rows + mark ABORTED + audit log")
                print()
                continue

            # 2) delete chunk rows (safe even if none)
            with conn.cursor() as cur:
                cur.execute("DELETE FROM chunks WHERE file_id=%s;", (file_id,))

            # 3) mark file ABORTED + timestamps (keep metadata)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE files
                    SET status='ABORTED',
                        aborted_at=COALESCE(aborted_at, now()),
                        cleaned_at=now()
                    WHERE file_id=%s
                    """,
                    (file_id,),
                )

            # 4) audit log
            details = {
                "filename": filename,
                "uploaded_chunks": int(uploaded_chunks),
                "last_activity_at": str(activity_at),
                "stale_minutes": stale_minutes,
                "cloud_dirs": list(CLOUD_DIRS),
                "hard_delete_file_row": hard_delete_file_row,
            }
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO key_events(event_type, file_id, old_version, new_version, details)
                    VALUES ('UPLOAD_CLEANUP_ABORT', %s, NULL, NULL, %s)
                    """,
                    (file_id, json.dumps(details)),
                )

            # 5) optional hard delete file row (NOT recommended by default)
            if hard_delete_file_row:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM files WHERE file_id=%s;", (file_id,))

            conn.commit()
            print("  ✅ Cleaned + marked ABORTED")
            print()

    print("Done.")


if __name__ == "__main__":
    main()
