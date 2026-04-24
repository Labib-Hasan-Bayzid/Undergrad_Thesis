# tls_decrypt_client.py (FULL REPLACEABLE, mTLS client + cap token + reqsig)
from __future__ import annotations

import json
import os
import socket
import ssl
import time
import hashlib
from pathlib import Path
from typing import Any, Dict, Optional

from tls_wire import (
    recv_msg,
    send_msg,
    recv_error,
    MSG_ERROR,
    MSG_GET_FILE,
    MSG_FILE_META,
    MSG_FILE_CHUNK,
    MSG_FILE_END,
    MSG_DONE,
    MSG_AUTH_REQ,
    MSG_AUTH_TOKEN,
    client_send_hello,
    client_expect_server_hello,
    set_socket_timeouts,
)

from capability_token import (
    load_or_create_client_keypair,
    compute_request_id,
    request_binding_bytes,
    b64u_enc,
)

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

HOST = os.getenv("TLS_HOST", "127.0.0.1")
PORT = int(os.getenv("TLS_DOWNLOAD_PORT", "9443"))

SOCKET_TIMEOUT = float(os.getenv("TLS_SOCKET_TIMEOUT", "30"))
RETRY_MAX = int(os.getenv("TLS_RETRY_MAX", "5"))

# CA that signs server cert
CA_FILE = os.getenv("TLS_CA_FILE")
if not CA_FILE:
    raise RuntimeError("TLS_CA_FILE not set (must be vault_ca.pem)")

# Client certificate + key for mTLS
CLIENT_CERT = os.getenv("TLS_CLIENT_CERT")
CLIENT_KEY  = os.getenv("TLS_CLIENT_KEY")
if not CLIENT_CERT or not CLIENT_KEY:
    raise RuntimeError("TLS_CLIENT_CERT and TLS_CLIENT_KEY must be set for mTLS")

def _write_path(out: str, filename: str) -> Path:
    p = Path(out).expanduser()
    if p.is_dir() or str(out).endswith("/"):
        p.mkdir(parents=True, exist_ok=True)
        return p / filename
    p.parent.mkdir(parents=True, exist_ok=True)
    return p

def _mk_authorized_request(file_id: str, token_str: str, client_pub_raw: bytes, sk: Ed25519PrivateKey) -> Dict[str, Any]:
    nonce = os.urandom(16).hex()
    ts = int(time.time())

    # decode token payload part (payload.sig where payload is JSON bytes b64u)
    payload_b64 = token_str.split(".", 1)[0]
    import base64
    pad = "=" * ((4 - (len(payload_b64) % 4)) % 4)
    payload = base64.urlsafe_b64decode((payload_b64 + pad).encode("ascii"))
    obj = json.loads(payload.decode("utf-8"))
    token_id = str(obj["token_id"])
    client_fp = str(obj["client_fp"])

    rid = compute_request_id(file_id, nonce, ts, token_id, client_fp)

    msg = request_binding_bytes(file_id, nonce, ts, token_id, client_fp)
    msg_digest = hashlib.sha3_512(msg).digest()
    sig = sk.sign(msg_digest)

    return {
        "file_id": file_id,
        "nonce": nonce,
        "ts": ts,
        "token": token_str,
        "client_pub_b64": b64u_enc(client_pub_raw),
        "sig_b64": b64u_enc(sig),
        "request_id": rid,
    }

def main() -> None:
    file_id = input("Enter file_id: ").strip()
    out = input("Output path (folder OR file): ").strip()

    sk, client_pub_raw = load_or_create_client_keypair()
    if len(client_pub_raw) != 32:
        raise RuntimeError("BAD_CLIENT_PUB_LEN")

    last_err: Optional[str] = None

    for attempt in range(1, RETRY_MAX + 1):
        try:
            raw = socket.create_connection((HOST, PORT), timeout=SOCKET_TIMEOUT)
            set_socket_timeouts(raw, SOCKET_TIMEOUT)

            ctx = ssl.create_default_context(cafile=CA_FILE)
            ctx.minimum_version = ssl.TLSVersion.TLSv1_3

            # ✅ mTLS client presents its cert
            ctx.load_cert_chain(certfile=CLIENT_CERT, keyfile=CLIENT_KEY)

            tls = ctx.wrap_socket(raw, server_hostname="localhost")
            set_socket_timeouts(tls, SOCKET_TIMEOUT)

            client_send_hello(tls, client_name="tls_decrypt_client", features=["mtls", "cap_token_v1", "ed25519_reqsig_v1"])
            _ = client_expect_server_hello(tls)

            # AUTH -> TOKEN (NO api_key; mTLS identity is the gate)
            auth_req = {
                "client_pub_b64": b64u_enc(client_pub_raw),
                "scope": {"files": [file_id]},
            }
            send_msg(tls, MSG_AUTH_REQ, json.dumps(auth_req).encode("utf-8"))

            t, pl = recv_msg(tls)
            if t == MSG_ERROR:
                err = recv_error(pl)
                raise RuntimeError(err.get("code", "AUTH_ERROR"))
            if t != MSG_AUTH_TOKEN:
                raise RuntimeError("BAD_AUTH_RESPONSE")

            tok = json.loads(pl.decode("utf-8"))
            token_str = tok.get("token")
            if not isinstance(token_str, str) or not token_str:
                raise RuntimeError("TOKEN_MISSING")

            req = _mk_authorized_request(file_id, token_str, client_pub_raw, sk)
            send_msg(tls, MSG_GET_FILE, json.dumps(req).encode("utf-8"))

            msg_type, payload = recv_msg(tls)
            if msg_type == MSG_ERROR:
                err = recv_error(payload)
                raise RuntimeError(err.get("code", "SERVER_ERROR"))
            if msg_type != MSG_FILE_META:
                raise RuntimeError("BAD_SERVER_RESPONSE")

            meta = json.loads(payload.decode("utf-8"))
            filename = meta.get("filename") or "decrypted_output.bin"
            out_path = _write_path(out, filename)

            with open(out_path, "wb") as f:
                while True:
                    t2, pl2 = recv_msg(tls)
                    if t2 == MSG_FILE_CHUNK:
                        if pl2:
                            f.write(pl2)
                        continue
                    if t2 in (MSG_FILE_END, MSG_DONE):
                        break
                    if t2 == MSG_ERROR:
                        err = recv_error(pl2)
                        raise RuntimeError(err.get("code", "SERVER_ERROR"))
                    raise RuntimeError("BAD_SERVER_RESPONSE")

            print(f"✅ Download complete: {out_path}")
            try:
                tls.close()
            except Exception:
                pass
            return

        except Exception as e:
            last_err = str(e)

    raise RuntimeError(f"❌ Download failed after retries: {last_err}")

if __name__ == "__main__":
    main()
