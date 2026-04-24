#!/usr/bin/env python3
import os
import sys
import secrets
import psycopg


DB_DSN = os.getenv(
    "DB_DSN",
    "host=127.0.0.1 port=5432 dbname=pqc_vault user=abdullahadnan",
)

ACTOR = os.getenv("KMS_ACTOR", "SYSTEM")
DRY_RUN = os.getenv("DRY_RUN", "false").lower() == "true"


def ensure_tables(conn):
    # kms_keks
    conn.execute("""
    CREATE TABLE IF NOT EXISTS kms_keks (
        kek_version   INT PRIMARY KEY,
        active        BOOLEAN NOT NULL DEFAULT FALSE,
        kek_material  BYTEA NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    """)

    # kms_audit
    conn.execute("""
    CREATE TABLE IF NOT EXISTS kms_audit (
        ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
        actor   TEXT NOT NULL,
        action  TEXT NOT NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    """)


def get_next_version(conn) -> int:
    row = conn.execute("SELECT COALESCE(MAX(kek_version), 0) FROM kms_keks;").fetchone()
    return int(row[0]) + 1


def rotate(conn):
    ensure_tables(conn)

    # sanity: at least one exists
    row = conn.execute("SELECT COUNT(*) FROM kms_keks;").fetchone()
    if int(row[0]) == 0:
        print("❌ No KEK found. Run: python kms_bootstrap.py first.")
        sys.exit(1)

    new_version = get_next_version(conn)
    new_kek = secrets.token_bytes(32)

    # Do everything atomically
    conn.execute("BEGIN;")

    # deactivate old
    conn.execute("UPDATE kms_keks SET active = FALSE WHERE active = TRUE;")

    # insert new
    conn.execute(
        "INSERT INTO kms_keks(kek_version, active, kek_material) VALUES (%s, TRUE, %s);",
        (new_version, new_kek),
    )

    # audit
    conn.execute(
        """
        INSERT INTO kms_audit(actor, action, details)
        VALUES (%s, 'ROTATE_KEK', jsonb_build_object('new_version', %s));
        """,
        (ACTOR, new_version),
    )

    if DRY_RUN:
        conn.execute("ROLLBACK;")
        print("🟡 DRY_RUN enabled → rolled back. Would have created KEK version:", new_version)
        return new_version

    conn.execute("COMMIT;")
    print("✅ KEK rotation complete")
    print("new active kek_version:", new_version)
    return new_version


def main():
    try:
        with psycopg.connect(DB_DSN) as conn:
            rotate(conn)
    except Exception as e:
        print("❌ Rotation failed:", repr(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
