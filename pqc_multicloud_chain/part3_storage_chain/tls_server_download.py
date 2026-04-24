# tls_server_download.py (FULL REPLACEABLE, mTLS + allowlist + cap token + reqsig + anti-replay)
from __future__ import annotations

import os
import ssl
import socket
import json
import time
import hashlib
import traceback
import threading
from typing import Any, Dict, Optional

import psycopg
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from tls_wire import (
    recv_msg,
    send_msg,
    send_error,
    MSG_GET_FILE,
    MSG_FILE_META,
    MSG_FILE_CHUNK,
    MSG_FILE_END,
    MSG_DONE,
    MSG_AUTH_REQ,
    MSG_AUTH_TOKEN,
    server_handle_hello,
    set_socket_timeouts,
)

from decrypt_file_envelope import decrypt_file_to_stream
from resource_limits import MAX_CONCURRENT_CONNS, SOCKET_TIMEOUT

from capability_token import (
    load_or_create_server_signing_key,
    verify_token,
    issue_token,
    scope_allows_file,
    client_fingerprint_from_pub,
    compute_request_id,
    request_binding_bytes,
    b64u_dec,
    b64u_enc,
)

HOST = os.getenv("TLS_HOST", "127.0.0.1")
PORT = int(os.getenv("TLS_DOWNLOAD_PORT", "9443"))

# Server cert/key for TLS
CERT_FILE = os.getenv("TLS_CERT_FILE", "cert.pem")
KEY_FILE  = os.getenv("TLS_KEY_FILE", "key.pem")

# mTLS trust anchor (CA that issued client certs)
MTLS_CA_FILE = os.getenv("MTLS_CA_FILE")  # REQUIRED

# Allowlist (fail-closed): comma-separated SHA256 hex fingerprints (no colons)
# Example: export MTLS_CLIENT_ALLOWLIST_SHA256="A1B2...FF,1122...EE"
MTLS_ALLOWLIST = os.getenv("MTLS_CLIENT_ALLOWLIST_SHA256", "").replace(":", "").strip()

# Anti-replay timing window
MAX_SKEW_SEC = int(os.getenv("REPLAY_MAX_SKEW_SEC", "120"))
REPLAY_TTL_SEC = int(os.getenv("REPLAY_TTL_SEC", "86400"))

# Capability token TTL
CAP_TTL_SEC = int(os.getenv("CAP_TTL_SEC", "120"))

_SEM = threading.BoundedSemaphore(MAX_CONCURRENT_CONNS)


def _json_loads(payload: bytes) -> Dict[str, Any]:
    if not payload:
        return {}
    return json.loads(payload.decode("utf-8"))


def _peer_cert_fingerprint_sha256_hex(tls_sock: ssl.SSLSocket) -> str:
    der = tls_sock.getpeercert(binary_form=True)
    if not der:
        # With CERT_REQUIRED this shouldn't happen; fail-closed anyway.
        raise RuntimeError("MTLS_NO_CLIENT_CERT")
    return hashlib.sha256(der).hexdigest().upper()


def _mtls_require_allowlisted_client(tls_sock: ssl.SSLSocket) -> str:
    if not MTLS_CA_FILE:
        raise RuntimeError("MTLS_CA_FILE_NOT_SET")

    if not MTLS_ALLOWLIST:
        # Industry-grade: fail closed if no allowlist is configured
        raise RuntimeError("MTLS_ALLOWLIST_EMPTY")

    fp = _peer_cert_fingerprint_sha256_hex(tls_sock)
    allow = {x.strip().upper() for x in MTLS_ALLOWLIST.split(",") if x.strip()}
    if fp not in allow:
        raise RuntimeError("MTLS_CLIENT_NOT_ALLOWED")
    return fp


def _anti_replay_check_and_store(conn: psycopg.Connection, request_id: str, file_id: str) -> None:
    # cleanup
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM request_replay_guard WHERE ts < now() - (%s || ' seconds')::interval",
            (str(REPLAY_TTL_SEC),),
        )

    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO request_replay_guard(request_id, file_id) VALUES (%s, %s)",
                (request_id, file_id),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise RuntimeError("REPLAY_DETECTED")


def _send_meta(tls_sock, file_id: str, filename: str, file_size: int, chunk_size: int, chunks_total: int) -> None:
    meta = {
        "file_id": file_id,
        "filename": filename,
        "file_size": int(file_size),
        "chunk_size": int(chunk_size),
        "chunks_total": int(chunks_total),
    }
    send_msg(tls_sock, MSG_FILE_META, json.dumps(meta).encode("utf-8"))


def _load_file_meta(conn: psycopg.Connection, file_id: str) -> Dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT filename, file_size, chunk_size, chunks_total, status
            FROM files
            WHERE file_id=%s
            """,
            (file_id,),
        )
        row = cur.fetchone()
    if not row:
        raise RuntimeError("FILE_NOT_FOUND")
    filename, file_size, chunk_size, chunks_total, status = row
    if status != "AVAILABLE":
        raise RuntimeError("NOT_AVAILABLE")
    return {
        "filename": filename,
        "file_size": int(file_size),
        "chunk_size": int(chunk_size),
        "chunks_total": int(chunks_total),
    }


def _handle_auth_and_issue_token(tls: ssl.SSLSocket, server_sk, server_pk, mtls_client_fp: str) -> str:
    """
    mTLS-protected AUTH:
      Client sends MSG_AUTH_REQ:
        {
          "client_pub_b64": "..." (raw 32 bytes ed25519 pub for request signing)
          "scope": {"files":["*"]} or {"files":["<file_id>"]}
        }

    Server replies MSG_AUTH_TOKEN:
      {"token":"payload.sig", "exp": <unix>, "mtls_client_fp": "..."}
    """
    t, pl = recv_msg(tls)
    if t != MSG_AUTH_REQ:
        raise RuntimeError("Expected MSG_AUTH_REQ")

    req = _json_loads(pl)
    client_pub_b64 = req.get("client_pub_b64")
    scope = req.get("scope") or {"files": ["*"]}

    if not isinstance(client_pub_b64, str) or not client_pub_b64:
        send_error(tls, "BAD_CLIENT_PUB", "Missing client_pub_b64")
        raise RuntimeError("BAD_CLIENT_PUB")

    try:
        client_pub_raw = b64u_dec(client_pub_b64)
    except Exception:
        send_error(tls, "BAD_CLIENT_PUB", "Invalid base64")
        raise RuntimeError("BAD_CLIENT_PUB")

    if len(client_pub_raw) != 32:
        send_error(tls, "BAD_CLIENT_PUB", "Ed25519 pub must be 32 bytes")
        raise RuntimeError("BAD_CLIENT_PUB")

    # Issue token (server-signed). Token binds to Ed25519 request-signing key fingerprint.
    token = issue_token(
        server_sk,
        client_pub_raw_32=client_pub_raw,
        ttl_seconds=CAP_TTL_SEC,
        scope=scope if isinstance(scope, dict) else {"files": ["*"]},
    )

    tok_obj = verify_token(server_pk, token)
    send_msg(
        tls,
        MSG_AUTH_TOKEN,
        json.dumps({"token": token, "exp": tok_obj.exp, "mtls_client_fp": mtls_client_fp}).encode("utf-8"),
    )
    return token


def _verify_authorized_request(conn: psycopg.Connection, server_pk, req: Dict[str, Any]) -> str:
    file_id = req.get("file_id")
    nonce = req.get("nonce")
    ts_val = req.get("ts")
    token = req.get("token")
    client_pub_b64 = req.get("client_pub_b64")
    sig_b64 = req.get("sig_b64")
    rid = req.get("request_id")

    if not isinstance(file_id, str) or not file_id:
        raise RuntimeError("BAD_FILE_ID")
    if not isinstance(nonce, str) or not nonce:
        raise RuntimeError("BAD_NONCE")
    if not isinstance(token, str) or not token:
        raise RuntimeError("MISSING_TOKEN")
    if not isinstance(client_pub_b64, str) or not client_pub_b64:
        raise RuntimeError("MISSING_CLIENT_PUB")
    if not isinstance(sig_b64, str) or not sig_b64:
        raise RuntimeError("MISSING_SIGNATURE")
    if not isinstance(rid, str) or len(rid) < 32:
        raise RuntimeError("BAD_REQUEST_ID")

    try:
        ts_int = int(ts_val)
    except Exception:
        raise RuntimeError("BAD_TIMESTAMP")

    now = int(time.time())
    if abs(now - ts_int) > MAX_SKEW_SEC:
        raise RuntimeError("REQUEST_EXPIRED")

    # Verify token signature + expiry + scope
    tok = verify_token(server_pk, token)
    if not scope_allows_file(tok, file_id):
        raise RuntimeError("TOKEN_SCOPE_DENIED")

    # Verify client pub + fingerprint binding
    try:
        client_pub_raw = b64u_dec(client_pub_b64)
    except Exception:
        raise RuntimeError("BAD_CLIENT_PUB")
    if len(client_pub_raw) != 32:
        raise RuntimeError("BAD_CLIENT_PUB")

    fp = client_fingerprint_from_pub(client_pub_raw)
    if fp != tok.client_fp:
        raise RuntimeError("CLIENT_FP_MISMATCH")

    # Compute expected request_id
    expected_rid = compute_request_id(file_id, nonce, ts_int, tok.token_id, tok.client_fp)
    if expected_rid != rid:
        raise RuntimeError("REQUEST_ID_MISMATCH")

    # Verify request signature
    msg = request_binding_bytes(file_id, nonce, ts_int, tok.token_id, tok.client_fp)
    msg_digest = hashlib.sha3_512(msg).digest()

    try:
        sig = b64u_dec(sig_b64)
    except Exception:
        raise RuntimeError("BAD_SIGNATURE")

    try:
        pub = Ed25519PublicKey.from_public_bytes(client_pub_raw)
        pub.verify(sig, msg_digest)
    except Exception:
        raise RuntimeError("SIGNATURE_INVALID")

    # Anti-replay
    _anti_replay_check_and_store(conn, expected_rid, file_id)

    return file_id


def main() -> None:
    if not MTLS_CA_FILE:
        raise RuntimeError("MTLS_CA_FILE must be set (CA that signs client certs)")

    conn = psycopg.connect(
        host=os.getenv("PGHOST", "127.0.0.1"),
        port=int(os.getenv("PGPORT", "5432")),
        dbname=os.getenv("PGDATABASE", "pqc_vault"),
        user=os.getenv("PGUSER", "abdullahadnan"),
        password=os.getenv("PGPASSWORD"),
        autocommit=False,
    )

    server_sk = load_or_create_server_signing_key("cap_server_ed25519.key")
    server_pk = server_sk.public_key()

    # ✅ Proper mTLS server context
    ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3
    ctx.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)

    # Require + verify client certificate
    ctx.load_verify_locations(cafile=MTLS_CA_FILE)
    ctx.verify_mode = ssl.CERT_REQUIRED

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((HOST, PORT))
    sock.listen(50)

    print(f"✅ mTLS download server listening on {HOST}:{PORT}")
    print(f"🛡️ MAX_CONCURRENT_CONNS={MAX_CONCURRENT_CONNS}")
    print("🛡️ mTLS: CERT_REQUIRED + allowlist + cap_token_v1 + ed25519_reqsig_v1 enabled")

    while True:
        raw, addr = sock.accept()

        if not _SEM.acquire(blocking=False):
            try:
                raw.close()
            except Exception:
                pass
            continue

        tls = None
        try:
            set_socket_timeouts(raw, SOCKET_TIMEOUT)
            tls = ctx.wrap_socket(raw, server_side=True)
            set_socket_timeouts(tls, SOCKET_TIMEOUT)

            # ✅ enforce allowlist AFTER TLS handshake (client cert already validated by CA)
            mtls_fp = _mtls_require_allowlisted_client(tls)

            _ = server_handle_hello(tls)

            # AUTH (mTLS identity gates token issuance)
            _ = _handle_auth_and_issue_token(tls, server_sk, server_pk, mtls_fp)

            # Expect GET
            msg_type, payload = recv_msg(tls)
            if msg_type != MSG_GET_FILE:
                send_error(tls, "BAD_REQUEST", "Expected MSG_GET_FILE")
                continue

            req = _json_loads(payload)

            try:
                file_id = _verify_authorized_request(conn, server_pk, req)
            except RuntimeError as e:
                send_error(tls, str(e))
                continue

            print(f"➡️ AUTHZ GET file_id={file_id} mtls_fp={mtls_fp}")

            meta = _load_file_meta(conn, file_id)
            _send_meta(tls, file_id, meta["filename"], meta["file_size"], meta["chunk_size"], meta["chunks_total"])

            def sink(data: bytes) -> None:
                send_msg(tls, MSG_FILE_CHUNK, data)

            try:
                decrypt_file_to_stream(conn, file_id, sink)
                send_msg(tls, MSG_FILE_END, b"")
                send_msg(tls, MSG_DONE, b'{"ok":true}')
            except (BrokenPipeError, ConnectionError):
                pass
            except Exception as e:
                code = "INTERNAL_ERROR"
                if str(e) in ("WIRE_LENGTH_TOO_LARGE", "WIRE_PAYLOAD_TOO_LARGE"):
                    code = "PAYLOAD_TOO_LARGE"
                try:
                    send_error(tls, code)
                except Exception:
                    pass
                print("❌ Download server error:")
                traceback.print_exc()

        except Exception:
            print("❌ Connection handler failed:")
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
