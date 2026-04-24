#!/usr/bin/env python3
"""
rotate_kek.py
Industry-grade KEK rotation
"""

import os
import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

DB_DSN = "dbname=pqc_vault user=abdullahadnan host=127.0.0.1 port=5432"


def main():
    file_id = input("Enter file_id to rotate KEK: ").strip()

    with psycopg.connect(DB_DSN) as conn:
        cur = conn.cursor()

        # Load file info
        cur.execute(
            """
            SELECT wrapped_dek, wrap_nonce, kek_version
            FROM files
            WHERE file_id=%s AND status='COMPLETE'
            """,
            (file_id,),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError("File not found")

        wrapped_dek, wrap_nonce, old_kek_version = row

        # Get active KEK
        cur.execute(
            "SELECT kek_version, kek_material FROM kms_keks WHERE active=true"
        )
        new_kek_version, new_kek = cur.fetchone()

        if new_kek_version == old_kek_version:
            print("Already using active KEK version", new_kek_version)
            return

        # Unwrap DEK using old KEK
        cur.execute(
            "SELECT kek_material FROM kms_keks WHERE kek_version=%s",
            (old_kek_version,),
        )
        old_kek = cur.fetchone()[0]

        dek = AESGCM(old_kek).decrypt(wrap_nonce, wrapped_dek, None)

        # Re-wrap under new KEK
        new_nonce = os.urandom(12)
        new_wrapped = AESGCM(new_kek).encrypt(new_nonce, dek, None)

        cur.execute(
            """
            UPDATE files
            SET wrapped_dek=%s,
                wrap_nonce=%s,
                kek_version=%s
            WHERE file_id=%s
            """,
            (new_wrapped, new_nonce, new_kek_version, file_id),
        )

        conn.commit()

    print("✅ KEK rotation done")
    print("new kek_version:", new_kek_version)


if __name__ == "__main__":
    main()
