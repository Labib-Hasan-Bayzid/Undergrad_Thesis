# tls_server_hybrid_store_chain.py
from __future__ import annotations

import os
import ssl
import socket
import traceback
import psycopg
import json
import threading
import hashlib
from typing import Optional, Set

from db_schema import require_schema
from hybrid_session import server_do_hybrid_inside_tls
from store_file_envelope import store_stream_tls
from tls_wire import (
    set_socket_timeouts,
    recv_msg,
    send_msg,
    send_error,
    server_handle_hello,
    MSG_FILE_META,
    MSG_DONE,
    MSG_ERROR,
)
from resource_limits import MAX_CONCURRENT_CONNS, SOCKET_TIMEOUT

HOST = os.getenv("TLS_HOST", "127.0.0.1")
PORT = int(os.getenv("TLS_UPLOAD_PORT", "8443"))

# Server cert/key for this upload server (mTLS server identity)
TLS_CERT_FILE = os.getenv("TLS_CERT_FILE", "cert.pem")
TLS_KEY_FILE = os.getenv("TLS_KEY_FILE", "key.pem")

# mTLS: CA that signs client certs (REQUIRED)
MTLS_CA_FILE = os.getenv("MTLS_CA_FILE")  # REQUIRED

# mTLS: allowlist of client certificate SHA256 fingerprints (hex, colon optional), comma-separated
# Example: export MTLS_CLIENT_ALLOWLIST_SHA256="A1B2...,FFEE..."
MTLS_CLIENT_ALLOWLIST_SHA256 = os.getenv("MTLS_CLIENT_ALLOWLIST_SHA256", "").strip()

_SEM = threading.BoundedSemaphore(MAX_CONCURRENT_CONNS)


def db_connect():
    return psycopg.connect(
        host=os.getenv("PGHOST", "127.0.0.1"),
        port=int(os.getenv("PGPORT", "5432")),
        dbname=os.getenv("PGDATABASE", "pqc_vault"),
        user=os.getenv("PGUSER", "abdullahadnan"),
        password=os.getenv("PGPASSWORD", ""),
        autocommit=True,
    )


def _norm_fp(s: str) -> str:
    # Normalize hex fingerprint: remove colons/spaces, uppercase
    return "".join(ch for ch in s.strip() if ch.isalnum()).upper()


def _parse_allowlist(raw: str) -> Set[str]:
    out: Set[str] = set()
    if not raw:
        return out
    for part in raw.split(","):
        p = _norm_fp(part)
        if p:
            out.add(p)
    return out


def _peer_cert_fingerprint_sha256_hex(tls_sock: ssl.SSLSocket) -> str:
    # Get peer cert in DER and SHA256 it
    der = tls_sock.getpeercert(binary_form=True)
    if not der:
        raise RuntimeError("MTLS_NO_CLIENT_CERT")
    return hashlib.sha256(der).hexdigest().upper()


def _enforce_client_allowlist(tls_sock: ssl.SSLSocket, allowlist: Set[str]) -> None:
    # If allowlist is empty, refuse (fail closed for “industry-grade deployable”)
    if not allowlist:
        raise RuntimeError("MTLS_ALLOWLIST_EMPTY")

    fp = _peer_cert_fingerprint_sha256_hex(tls_sock)
    if fp not in allowlist:
        raise RuntimeError("MTLS_CLIENT_NOT_ALLOWED")


def _build_tls_context_mtls() -> ssl.SSLContext:
    if not MTLS_CA_FILE:
        raise RuntimeError("MTLS_CA_FILE must be set (CA that signs client certs)")

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3

    # Server identity
    ctx.load_cert_chain(certfile=TLS_CERT_FILE, keyfile=TLS_KEY_FILE)

    # Trust store for CLIENT certificates
    ctx.load_verify_locations(cafile=MTLS_CA_FILE)

    # Require client cert (mTLS)
    ctx.verify_mode = ssl.CERT_REQUIRED

    # Hardening knobs (best-effort; not all exist on all Python builds)
    try:
        ctx.options |= ssl.OP_NO_COMPRESSION
    except Exception:
        pass
    try:
        ctx.options |= ssl.OP_NO_RENEGOTIATION
    except Exception:
        pass

    return ctx


def handle_client(tls_sock: ssl.SSLSocket, allowlist: Set[str]) -> None:
    # Enforce allowlist after TLS handshake completes
    _enforce_client_allowlist(tls_sock, allowlist)

    # Wire protocol: HELLO
    server_handle_hello(tls_sock)

    # In-band hybrid handshake (inside TLS)
    hybrid_secret, transcript_hash = server_do_hybrid_inside_tls(tls_sock)

    # Expect META
    msg_type, payload = recv_msg(tls_sock)
    if msg_type == MSG_ERROR:
        raise RuntimeError("Client sent MSG_ERROR")
    if msg_type != MSG_FILE_META:
        send_error(tls_sock, "BAD_REQUEST", "Expected MSG_FILE_META after hybrid handshake")
        raise RuntimeError("Expected MSG_FILE_META after hybrid handshake")

    meta = json.loads(payload.decode("utf-8") or "{}")
    filename = meta.get("filename", "upload.bin")
    file_size = int(meta.get("file_size", 0))
    upload_token = meta.get("upload_token")

    conn = db_connect()
    require_schema(conn)

    file_id = store_stream_tls(
        conn=conn,
        tls_sock=tls_sock,
        filename=filename,
        file_size=file_size,
        hybrid_session_secret=hybrid_secret,
        transcript_hash_sha3_512=transcript_hash,
        upload_token=upload_token,
    )

    send_msg(tls_sock, MSG_DONE, str(file_id).encode("utf-8"))


def main():
    # Fail fast: schema check
    conn = db_connect()
    require_schema(conn)
    conn.close()

    allowlist = _parse_allowlist(MTLS_CLIENT_ALLOWLIST_SHA256)
    if not allowlist:
        raise RuntimeError("MTLS_CLIENT_ALLOWLIST_SHA256 must be set and non-empty (comma-separated SHA256 fingerprints)")

    ctx = _build_tls_context_mtls()

    sock = socket.socket()
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((HOST, PORT))
    sock.listen(50)

    print(f"✅ mTLS Upload server listening on {HOST}:{PORT}")
    print(f"🛡️ MAX_CONCURRENT_CONNS={MAX_CONCURRENT_CONNS}")
    print(f"🛡️ TLS_CERT_FILE={TLS_CERT_FILE}")
    print(f"🛡️ MTLS_CA_FILE={MTLS_CA_FILE}")
    print(f"🛡️ Allowlisted client certs: {len(allowlist)}")

    while True:
        raw, addr = sock.accept()

        # Hard concurrency limit
        if not _SEM.acquire(blocking=False):
            try:
                raw.close()
            except Exception:
                pass
            continue

        tls: Optional[ssl.SSLSocket] = None
        try:
            set_socket_timeouts(raw, SOCKET_TIMEOUT)
            tls = ctx.wrap_socket(raw, server_side=True)  # mTLS handshake happens here
            set_socket_timeouts(tls, SOCKET_TIMEOUT)

            print(f"\n🔌 Connection from {addr}")
            print("✅ TLS 1.3 established (mTLS)")
            print("cipher:", tls.cipher())

            handle_client(tls, allowlist)

        except Exception as e:
            # Don’t leak internal errors to client; fail closed
            try:
                if tls is not None:
                    code = "INTERNAL_ERROR"
                    if str(e) in ("WIRE_LENGTH_TOO_LARGE", "WIRE_PAYLOAD_TOO_LARGE"):
                        code = "PAYLOAD_TOO_LARGE"
                    elif str(e).startswith("MTLS_"):
                        code = str(e)
                    send_error(tls, code, "Upload server failure")
            except Exception:
                pass

            print("❌ Upload server error:")
            traceback.print_exc()

        finally:
            try:
                if tls is not None:
                    tls.close()
            except Exception:
                pass
            _SEM.release()


if __name__ == "__main__":
    main()
