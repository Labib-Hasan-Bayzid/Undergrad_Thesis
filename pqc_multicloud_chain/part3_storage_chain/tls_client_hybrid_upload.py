# tls_client_hybrid_upload.py
from __future__ import annotations

import json
import os
import socket
import ssl
import uuid
from pathlib import Path

from hybrid_session import client_hybrid_handshake
from tls_wire import (
    set_socket_timeouts,
    send_msg,
    recv_msg,
    recv_error,
    client_send_hello,
    client_expect_server_hello,
    MSG_FILE_META,
    MSG_FILE_CHUNK,
    MSG_FILE_END,
    MSG_DONE,
    MSG_ERROR,
)

HOST = os.getenv("TLS_HOST", "127.0.0.1")
PORT = int(os.getenv("TLS_UPLOAD_PORT", "8443"))

SOCKET_TIMEOUT = float(os.getenv("TLS_SOCKET_TIMEOUT", "30"))

# Verify server (CA)
TLS_CA_FILE = os.getenv("TLS_CA_FILE")  # REQUIRED for secure deploy
# Client identity (mTLS)
TLS_CLIENT_CERT = os.getenv("TLS_CLIENT_CERT")  # REQUIRED
TLS_CLIENT_KEY = os.getenv("TLS_CLIENT_KEY")    # REQUIRED


def main():
    if not TLS_CA_FILE:
        raise RuntimeError("TLS_CA_FILE env not set. Example: export TLS_CA_FILE=mtls/vault_ca.pem")
    if not TLS_CLIENT_CERT or not TLS_CLIENT_KEY:
        raise RuntimeError("TLS_CLIENT_CERT and TLS_CLIENT_KEY must be set for mTLS client auth")

    file_path = input("File path to upload: ").strip()
    p = Path(file_path).expanduser()
    if not p.exists() or not p.is_file():
        raise RuntimeError("File not found")

    # Idempotency token (reuse on retries)
    upload_token = os.getenv("UPLOAD_TOKEN") or str(uuid.uuid4())
    print(f"🧷 upload_token: {upload_token}")
    print("   (If upload fails, retry with: export UPLOAD_TOKEN=<that token>)")

    raw = socket.create_connection((HOST, PORT), timeout=SOCKET_TIMEOUT)

    ctx = ssl.create_default_context(cafile=TLS_CA_FILE)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3

    # mTLS: present client certificate to server
    ctx.load_cert_chain(certfile=TLS_CLIENT_CERT, keyfile=TLS_CLIENT_KEY)

    tls = ctx.wrap_socket(raw, server_hostname="localhost")
    set_socket_timeouts(tls, SOCKET_TIMEOUT)

    print("✅ TLS 1.3 connected (mTLS)")
    print("cipher:", tls.cipher())

    client_send_hello(tls, client_name="tls_client_hybrid_upload", features=["upload", "hybrid", "mtls"])
    client_expect_server_hello(tls)

    hybrid_secret, transcript_hash = client_hybrid_handshake(tls)
    if not hybrid_secret or not transcript_hash:
        raise RuntimeError("Hybrid secret/transcript not derived")

    meta = {
        "filename": p.name,
        "file_size": p.stat().st_size,
        "upload_token": upload_token,
    }
    send_msg(tls, MSG_FILE_META, json.dumps(meta).encode("utf-8"))

    sent = 0
    with open(p, "rb") as f:
        while True:
            chunk = f.read(8 * 1024 * 1024)
            if not chunk:
                break
            send_msg(tls, MSG_FILE_CHUNK, chunk)
            sent += len(chunk)

    send_msg(tls, MSG_FILE_END, b"")

    msg_type, payload = recv_msg(tls)
    if msg_type == MSG_ERROR:
        err = recv_error(payload)
        raise RuntimeError(f"Server rejected: {err.get('code')}")
    if msg_type != MSG_DONE:
        raise RuntimeError("Expected MSG_DONE")

    print("✅ Upload done.")
    print("bytes_sent:", sent)
    print("server_response:", payload.decode("utf-8", errors="replace"))


if __name__ == "__main__":
    main()
