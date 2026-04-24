from __future__ import annotations

import json
import os
import socket
import ssl
import argparse
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

TLS_CA_FILE = os.getenv("TLS_CA_FILE")
TLS_CLIENT_CERT = os.getenv("TLS_CLIENT_CERT")
TLS_CLIENT_KEY = os.getenv("TLS_CLIENT_KEY")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    args = parser.parse_args()

    file_path = Path(args.file).expanduser()
    if not file_path.exists():
        raise RuntimeError("File not found")

    raw = socket.create_connection((HOST, PORT), timeout=SOCKET_TIMEOUT)

    ctx = ssl.create_default_context(cafile=TLS_CA_FILE)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3
    ctx.load_cert_chain(certfile=TLS_CLIENT_CERT, keyfile=TLS_CLIENT_KEY)

    tls = ctx.wrap_socket(raw, server_hostname="localhost")
    set_socket_timeouts(tls, SOCKET_TIMEOUT)

    client_send_hello(tls, client_name="bridge_upload", features=["upload", "hybrid", "mtls"])
    client_expect_server_hello(tls)

    hybrid_secret, transcript_hash = client_hybrid_handshake(tls)

    meta = {
        "filename": file_path.name,
        "file_size": file_path.stat().st_size,
    }

    send_msg(tls, MSG_FILE_META, json.dumps(meta).encode("utf-8"))

    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(8 * 1024 * 1024)
            if not chunk:
                break
            send_msg(tls, MSG_FILE_CHUNK, chunk)

    send_msg(tls, MSG_FILE_END, b"")

    msg_type, payload = recv_msg(tls)

    if msg_type == MSG_ERROR:
        err = recv_error(payload)
        raise RuntimeError(f"Server rejected: {err.get('code')}")

    if msg_type != MSG_DONE:
        raise RuntimeError("Expected MSG_DONE")

    raw_result = payload.decode("utf-8", errors="replace").strip()

    file_id = raw_result
    try:
        parsed = json.loads(raw_result)
        if isinstance(parsed, dict) and parsed.get("file_id"):
            file_id = parsed["file_id"]
    except Exception:
        pass

    print(json.dumps({"ok": True, "fileId": file_id}))


if __name__ == "__main__":
    main()
