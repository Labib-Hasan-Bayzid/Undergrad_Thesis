# kms_local.py
from __future__ import annotations
import os
from pathlib import Path
from config import KMS_MASTER_PATH

def load_or_create_kms_master() -> bytes:
    """
    Local "KMS master key" (32 bytes).
    In real industry deploy: replace this with AWS KMS / Azure Key Vault / GCP KMS.
    """
    p = Path(KMS_MASTER_PATH)
    if not p.exists():
        key = os.urandom(32)
        p.write_bytes(key)
        try:
            os.chmod(p, 0o600)
        except Exception:
            # chmod may fail in some environments; safe to ignore locally
            pass
        return key
    key = p.read_bytes()
    if len(key) != 32:
        raise ValueError(f"KMS master key must be 32 bytes. Found {len(key)} bytes in {p}")
    return key
