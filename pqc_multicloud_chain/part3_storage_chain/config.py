# config.py
import os

DB_DSN = os.getenv("PG_DSN", "postgresql://abdullahadnan@127.0.0.1:5432/pqc_vault")

DEFAULT_CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", str(8 * 1024 * 1024)))  # 8MB

CLOUD_DIRS = [
    os.getenv("CLOUD_A", "cloud_A"),
    os.getenv("CLOUD_B", "cloud_B"),
    os.getenv("CLOUD_C", "cloud_C"),
]

KMS_MASTER_PATH = os.getenv("KMS_MASTER_PATH", "kms_master.key")
