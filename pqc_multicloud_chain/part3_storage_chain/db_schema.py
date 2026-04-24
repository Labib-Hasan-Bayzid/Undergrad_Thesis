# db_schema.py
import os
from pathlib import Path
import psycopg

REQUIRED_SCHEMA_VERSION = 1


def _get_current_version(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT to_regclass('public.schema_version') IS NOT NULL
        """)
        exists = cur.fetchone()[0]
        if not exists:
            return -1

        cur.execute("SELECT version FROM schema_version LIMIT 1;")
        row = cur.fetchone()
        if not row:
            return -1
        return int(row[0])


def _apply_sql(conn, sql_text: str, label: str):
    with conn.cursor() as cur:
        cur.execute(sql_text)


def _load_migrations() -> list[tuple[int, Path]]:
    mig_dir = Path(__file__).parent / "migrations"
    if not mig_dir.exists():
        return []
    out = []
    for p in sorted(mig_dir.glob("*.sql")):
        # Expect filenames like 0001_contract.sql
        try:
            ver = int(p.name.split("_", 1)[0])
        except Exception:
            continue
        out.append((ver, p))
    return sorted(out, key=lambda x: x[0])


def migrate_to_required(conn, required: int = REQUIRED_SCHEMA_VERSION):
    migrations = _load_migrations()
    if not migrations:
        raise RuntimeError("No migrations found. Expected ./migrations/*.sql")

    current = _get_current_version(conn)

    # If schema_version table is missing, treat as 0 and let migrations create it.
    if current < 0:
        current = 0

    for ver, path in migrations:
        if ver <= current:
            continue
        if ver > required:
            break
        sql = path.read_text(encoding="utf-8")
        _apply_sql(conn, sql, path.name)
        current = ver

    final = _get_current_version(conn)
    if final < required:
        raise RuntimeError(f"Migration incomplete. Current={final}, required={required}")


def require_schema(conn, required: int = REQUIRED_SCHEMA_VERSION):
    """
    Enforce schema contract.
    If AUTO_MIGRATE=1 -> applies migrations up to REQUIRED_SCHEMA_VERSION.
    Otherwise -> refuse to run if DB behind.
    """
    current = _get_current_version(conn)
    auto = os.getenv("AUTO_MIGRATE", "0") == "1"

    if current < 0:
        # schema_version missing
        if auto:
            migrate_to_required(conn, required)
            return
        raise RuntimeError(
            "DB schema contract not initialized (schema_version missing).\n"
            "Run: python migrate_db.py\n"
            "Or start server with: AUTO_MIGRATE=1"
        )

    if current < required:
        if auto:
            migrate_to_required(conn, required)
            return
        raise RuntimeError(
            f"DB schema too old. current={current} required={required}\n"
            "Run: python migrate_db.py\n"
            "Or start server with: AUTO_MIGRATE=1"
        )
