import os
import json
import psycopg

PGHOST = os.getenv("PGHOST", "127.0.0.1")
PGPORT = int(os.getenv("PGPORT", "5432"))
PGDATABASE = os.getenv("PGDATABASE", "pqc_vault")
PGUSER = os.getenv("PGUSER", "abdullahadnan")
PGPASSWORD = os.getenv("PGPASSWORD", "")

# TTL / policy knobs
UPLOAD_TTL_MIN = int(os.getenv("UPLOAD_TTL_MIN", "60"))
FAILED_PURGE_DAYS = int(os.getenv("FAILED_PURGE_DAYS", "30"))
PURGE_FAILED = os.getenv("PURGE_FAILED", "0") == "1"
REPLAY_GUARD_TTL_SEC = int(os.getenv("REPLAY_GUARD_TTL_SEC", "86400"))
UPLOAD_SESSIONS_TTL_DAYS = int(os.getenv("UPLOAD_SESSIONS_TTL_DAYS", "7"))

ACTOR = os.getenv("HYGIENE_ACTOR", "HYGIENE_JOB")


def log(cur, action: str, details: dict):
    cur.execute(
        "INSERT INTO hygiene_log(actor, action, details) VALUES (%s,%s,%s::jsonb)",
        (ACTOR, action, json.dumps(details)),
    )


def _fetch_failed_stats(cur, failed_purge_days: int) -> dict:
    # total FAILED and due-now FAILED
    cur.execute(
        """
        SELECT
          COUNT(*) FILTER (WHERE status='FAILED') AS failed_total,
          COUNT(*) FILTER (
            WHERE status='FAILED'
              AND failed_at IS NOT NULL
              AND failed_at < now() - (%s * INTERVAL '1 day')
          ) AS failed_due_now
        FROM files
        """,
        (failed_purge_days,),
    )
    failed_total, failed_due_now = cur.fetchone()

    # next due days + nearest 10 rows
    cur.execute(
        """
        WITH due AS (
          SELECT
            file_id,
            failed_at,
            (failed_at + (%s * INTERVAL '1 day')) AS due_at,
            GREATEST(
              0,
              CEIL(EXTRACT(EPOCH FROM ((failed_at + (%s * INTERVAL '1 day')) - now())) / 86400.0)
            )::int AS days_remaining
          FROM files
          WHERE status='FAILED' AND failed_at IS NOT NULL
        )
        SELECT file_id::text, due_at, days_remaining
        FROM due
        ORDER BY days_remaining ASC, failed_at ASC
        LIMIT 10
        """,
        (failed_purge_days, failed_purge_days),
    )
    closest = [{"file_id": r[0], "due_at": str(r[1]), "days_remaining": int(r[2])} for r in cur.fetchall()]

    next_due_days = None
    if closest:
        next_due_days = int(closest[0]["days_remaining"])

    return {
        "failed_total": int(failed_total),
        "failed_due_now": int(failed_due_now),
        "next_due_days": next_due_days,
        "closest_failed_to_purge": closest,
    }


def main():
    dsn = f"host={PGHOST} port={PGPORT} dbname={PGDATABASE} user={PGUSER} password={PGPASSWORD}"

    n_norm = n_expire = n_sessions = n_replay = n_purge = 0

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:

            # Ensure failed_at exists (if your schema already has it, this is safe)
            cur.execute("ALTER TABLE files ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ")

            # If FAILED and failed_at missing, best-effort fill from created_at
            cur.execute(
                """
                UPDATE files
                SET failed_at = COALESCE(failed_at, created_at)
                WHERE status='FAILED' AND failed_at IS NULL
                """
            )

            # Stats BEFORE purge
            before = _fetch_failed_stats(cur, FAILED_PURGE_DAYS)

            # 1) Normalize legacy statuses
            cur.execute(
                """
                UPDATE files
                SET status='FAILED',
                    failed_at=COALESCE(failed_at, now())
                WHERE status NOT IN ('AVAILABLE','FAILED','UPLOADING')
                """
            )
            n_norm = cur.rowcount

            # 2) Expire stale UPLOADING
            cur.execute(
                """
                UPDATE files
                SET status='FAILED',
                    failed_at=COALESCE(failed_at, now())
                WHERE status='UPLOADING'
                  AND last_activity_at < now() - (%s || ' minutes')::interval
                """,
                (str(UPLOAD_TTL_MIN),),
            )
            n_expire = cur.rowcount

            # 3) Cleanup upload_sessions older than TTL
            cur.execute(
                """
                DELETE FROM upload_sessions
                WHERE created_at < now() - (%s || ' days')::interval
                """,
                (str(UPLOAD_SESSIONS_TTL_DAYS),),
            )
            n_sessions = cur.rowcount

            # 4) Cleanup replay guard older than TTL
            cur.execute(
                """
                DELETE FROM request_replay_guard
                WHERE ts < now() - (%s || ' seconds')::interval
                """,
                (str(REPLAY_GUARD_TTL_SEC),),
            )
            n_replay = cur.rowcount

            # 5) Optional purge FAILED (uses failed_at, not created_at)
            if PURGE_FAILED:
                cur.execute(
                    """
                    DELETE FROM files
                    WHERE status='FAILED'
                      AND failed_at IS NOT NULL
                      AND failed_at < now() - (%s * INTERVAL '1 day')
                    """,
                    (FAILED_PURGE_DAYS,),
                )
                n_purge = cur.rowcount

            # Stats AFTER purge (this is the upgrade you asked)
            after = _fetch_failed_stats(cur, FAILED_PURGE_DAYS)

            # ✅ Always log summary (even if 0)
            log(cur, "HYGIENE_RUN", {
                "normalized": n_norm,
                "expired_uploading": n_expire,
                "cleaned_sessions": n_sessions,
                "cleaned_replay": n_replay,
                "purge_enabled": PURGE_FAILED,
                "purged_failed": n_purge,
                "upload_ttl_min": UPLOAD_TTL_MIN,
                "sessions_ttl_days": UPLOAD_SESSIONS_TTL_DAYS,
                "replay_ttl_sec": REPLAY_GUARD_TTL_SEC,
                "failed_purge_days": FAILED_PURGE_DAYS,
                "failed_total_before": before["failed_total"],
                "failed_due_now_before": before["failed_due_now"],
                "failed_total_after": after["failed_total"],
                "failed_due_now_after": after["failed_due_now"],
                "next_due_days": after["next_due_days"],
            })

        conn.commit()

    print("✅ Hygiene cleanup done.")
    print(f"   normalized={n_norm} expired_uploading={n_expire} cleaned_sessions={n_sessions} cleaned_replay={n_replay} purge_enabled={PURGE_FAILED} purged_failed={n_purge}")

    print(f"   failed_total_before={before['failed_total']} failed_due_now_before={before['failed_due_now']} failed_purge_days={FAILED_PURGE_DAYS}")
    print(f"   failed_remaining_after_purge={after['failed_total']} due_now_after_purge={after['failed_due_now']}")

    if after["next_due_days"] is None:
        print("   next_due_days=None (no FAILED rows found)")
    else:
        print(f"   next_due_days={after['next_due_days']}")

    if after["closest_failed_to_purge"]:
        print("   closest_failed_to_purge (top 10):")
        for row in after["closest_failed_to_purge"]:
            print(f"     - {row['file_id']}  days_remaining={row['days_remaining']}  due_at={row['due_at']}")
    else:
        print("   closest_failed_to_purge: []")


if __name__ == "__main__":
    main()
