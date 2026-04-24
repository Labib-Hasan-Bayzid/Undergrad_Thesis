# resource_limits.py
from __future__ import annotations
import os

def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except Exception:
        return default

def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except Exception:
        return default

# -------------------------
# Hard caps (industry-safe defaults)
# -------------------------
# Wire message caps (prevents "huge payload claim" DoS)
MAX_WIRE_MSG_BYTES = _int("MAX_WIRE_MSG_BYTES", 10 * 1024 * 1024)   # 10 MB max per framed message

# Upload controls
MAX_FILE_SIZE_BYTES = _int("MAX_FILE_SIZE_BYTES", 2 * 1024 * 1024 * 1024)  # 2 GB
MAX_CHUNK_SIZE_BYTES = _int("MAX_CHUNK_SIZE_BYTES", 8 * 1024 * 1024)       # 8 MB
MAX_CHUNKS_PER_FILE = _int("MAX_CHUNKS_PER_FILE", 4096)                    # hard upper bound
MAX_UPLOAD_SECONDS = _int("MAX_UPLOAD_SECONDS", 15 * 60)                   # 15 minutes per upload session

# Connection controls
MAX_CONCURRENT_CONNS = _int("MAX_CONCURRENT_CONNS", 30)
SOCKET_TIMEOUT = _float("TLS_SOCKET_TIMEOUT", 30.0)

# Download controls
MAX_DOWNLOAD_SECONDS = _int("MAX_DOWNLOAD_SECONDS", 20 * 60)               # 20 minutes
