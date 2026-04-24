# capability_token.py
from __future__ import annotations

import base64
import json
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives import hashes


# ---------------------------
# Helpers
# ---------------------------
def b64u_enc(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")

def b64u_dec(s: str) -> bytes:
    pad = "=" * ((4 - (len(s) % 4)) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("ascii"))

def sha3_512(b: bytes) -> bytes:
    h = hashes.Hash(hashes.SHA3_512())
    h.update(b)
    return h.finalize()

def client_fingerprint_from_pub(pub_raw_32: bytes) -> str:
    # 64-byte hash, hex
    return sha3_512(pub_raw_32).hex()

def load_or_create_server_signing_key(path: str = "cap_server_ed25519.key") -> Ed25519PrivateKey:
    """
    Server signing key for capability tokens.
    Stored as raw 32-byte seed (simple & portable).
    """
    if os.path.exists(path):
        raw = open(path, "rb").read()
        if len(raw) != 32:
            raise RuntimeError("BAD_SERVER_SIGN_KEY_FILE")
        return Ed25519PrivateKey.from_private_bytes(raw)

    sk = Ed25519PrivateKey.generate()
    raw = sk.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    with open(path, "wb") as f:
        f.write(raw)
    try:
        os.chmod(path, 0o600)
    except Exception:
        pass
    return sk

def load_or_create_client_keypair(
    priv_path: str = "cap_client_ed25519.key",
    pub_path: str = "cap_client_ed25519.pub",
) -> Tuple[Ed25519PrivateKey, bytes]:
    """
    Client keypair for signing requests.
    Stored raw (32-byte sk seed) and raw pub (32 bytes).
    """
    if os.path.exists(priv_path) and os.path.exists(pub_path):
        sk_raw = open(priv_path, "rb").read()
        pk_raw = open(pub_path, "rb").read()
        if len(sk_raw) != 32 or len(pk_raw) != 32:
            raise RuntimeError("BAD_CLIENT_KEY_FILES")
        return Ed25519PrivateKey.from_private_bytes(sk_raw), pk_raw

    sk = Ed25519PrivateKey.generate()
    pk = sk.public_key()
    sk_raw = sk.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pk_raw = pk.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    with open(priv_path, "wb") as f:
        f.write(sk_raw)
    with open(pub_path, "wb") as f:
        f.write(pk_raw)
    try:
        os.chmod(priv_path, 0o600)
        os.chmod(pub_path, 0o644)
    except Exception:
        pass
    return sk, pk_raw


# ---------------------------
# Token model
# ---------------------------
@dataclass
class CapabilityToken:
    token_id: str
    iat: int
    exp: int
    client_fp: str
    scope: Dict[str, Any]

def _canonical_token_payload(obj: Dict[str, Any]) -> bytes:
    # stable ordering: ensures signature reproducible
    return json.dumps(obj, separators=(",", ":"), sort_keys=True).encode("utf-8")

def issue_token(
    server_sk: Ed25519PrivateKey,
    *,
    client_pub_raw_32: bytes,
    ttl_seconds: int,
    scope: Dict[str, Any],
) -> str:
    now = int(time.time())
    tok = {
        "token_id": str(uuid.uuid4()),
        "iat": now,
        "exp": now + int(ttl_seconds),
        "client_fp": client_fingerprint_from_pub(client_pub_raw_32),
        "scope": scope,
    }
    payload = _canonical_token_payload(tok)
    sig = server_sk.sign(payload)
    # compact: payload_b64.sig_b64
    return b64u_enc(payload) + "." + b64u_enc(sig)

def verify_token(
    server_pk: Ed25519PublicKey,
    token_str: str,
) -> CapabilityToken:
    if not isinstance(token_str, str) or "." not in token_str:
        raise RuntimeError("BAD_TOKEN_FORMAT")

    p_b64, s_b64 = token_str.split(".", 1)
    payload = b64u_dec(p_b64)
    sig = b64u_dec(s_b64)

    try:
        server_pk.verify(sig, payload)
    except Exception:
        raise RuntimeError("TOKEN_SIGNATURE_INVALID")

    try:
        obj = json.loads(payload.decode("utf-8"))
    except Exception:
        raise RuntimeError("TOKEN_PAYLOAD_BAD")

    for k in ("token_id", "iat", "exp", "client_fp", "scope"):
        if k not in obj:
            raise RuntimeError("TOKEN_MISSING_FIELDS")

    now = int(time.time())
    if int(obj["exp"]) < now:
        raise RuntimeError("TOKEN_EXPIRED")

    return CapabilityToken(
        token_id=str(obj["token_id"]),
        iat=int(obj["iat"]),
        exp=int(obj["exp"]),
        client_fp=str(obj["client_fp"]),
        scope=dict(obj["scope"]) if isinstance(obj["scope"], dict) else {},
    )

def scope_allows_file(tok: CapabilityToken, file_id: str) -> bool:
    files = tok.scope.get("files")
    if files == "*" or files == ["*"]:
        return True
    if isinstance(files, list) and file_id in files:
        return True
    return False

def request_binding_bytes(file_id: str, nonce_hex: str, ts_int: int, token_id: str, client_fp: str) -> bytes:
    # strict canonical string
    s = f"{file_id}|{nonce_hex}|{ts_int}|{token_id}|{client_fp}"
    return s.encode("utf-8")

def compute_request_id(file_id: str, nonce_hex: str, ts_int: int, token_id: str, client_fp: str) -> str:
    return sha3_512(request_binding_bytes(file_id, nonce_hex, ts_int, token_id, client_fp)).hex()
