# migrate_db.py
import os
import psycopg
from db_schema import migrate_to_required, REQUIRED_SCHEMA_VERSION


def db_connect():
    return psycopg.connect(
        host=os.getenv("PGHOST", "127.0.0.1"),
        port=int(os.getenv("PGPORT", "5432")),
        dbname=os.getenv("PGDATABASE", "pqc_vault"),
        user=os.getenv("PGUSER", "abdullahadnan"),
        password=os.getenv("PGPASSWORD", ""),
        autocommit=True,
    )


def main():
    conn = db_connect()
    migrate_to_required(conn, REQUIRED_SCHEMA_VERSION)
    print(f"✅ DB migrated to schema_version={REQUIRED_SCHEMA_VERSION}")


if __name__ == "__main__":
    main()
