import psycopg
import os

DB_DSN = "dbname=pqc_vault user=abdullahadnan password=" + os.environ["PGPASSWORD"]

def log(actor, action, file_id=None, details=None):
    with psycopg.connect(DB_DSN) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO kms_audit (actor, action, file_id, details)
                VALUES (%s, %s, %s, %s)
            """, (actor, action, file_id, details))
        conn.commit()
