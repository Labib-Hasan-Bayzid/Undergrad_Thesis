# hybrid_session.py
from __future__ import annotations

from oqs import KeyEncapsulation
from cryptography.hazmat.primitives.asymmetric.x25519 import (
    X25519PrivateKey,
    X25519PublicKey,
)
from tls_wire import (
    send_msg, recv_msg,
    MSG_KYBER_PK, MSG_KYBER_CT,
    MSG_X25519_S_PUB, MSG_X25519_C_PUB,
)
from crypto_utils import sha3_512


KEM_ALG = "Kyber768"

# Domain separation labels (prevents any ambiguity)
_LABEL_X = b"X25519"
_LABEL_K = b"KYBER768"
_LABEL_T = b"TRANSCRIPT_V2"
_LABEL_HYB = b"HYBRID_SECRET_V1"


def _require_len(b: bytes, n: int, err: str) -> None:
    if not isinstance(b, (bytes, bytearray)) or len(b) != n:
        raise RuntimeError(err)


def server_do_hybrid_inside_tls(tls_sock):
    """
    Server hybrid (inside TLS):
      1) X25519: generate (sk, pkS), send pkS, receive pkC, derive x_secret
      2) Kyber768: generate pkK, receive ctK, derive k_secret
      3) transcript_hash = SHA3-512( LABEL_T || X25519 pkS||pkC || Kyber pkK||ctK )
      4) hybrid_secret = x_secret || k_secret   (64 bytes)
    """
    # ---- X25519 ----
    x_sk = X25519PrivateKey.generate()
    x_pk_s = x_sk.public_key().public_bytes_raw()
    _require_len(x_pk_s, 32, "BAD_X25519_SERVER_PUB")

    send_msg(tls_sock, MSG_X25519_S_PUB, x_pk_s)

    msg_type, x_pk_c = recv_msg(tls_sock)
    if msg_type != MSG_X25519_C_PUB:
        raise RuntimeError("Expected MSG_X25519_C_PUB")
    _require_len(x_pk_c, 32, "BAD_X25519_CLIENT_PUB")

    try:
        x_pub_c = X25519PublicKey.from_public_bytes(x_pk_c)
        x_secret = x_sk.exchange(x_pub_c)  # 32 bytes
    except Exception:
        raise RuntimeError("X25519_EXCHANGE_FAILED")

    _require_len(x_secret, 32, "BAD_X25519_SECRET")

    # ---- Kyber768 (KEM) ----
    kem = KeyEncapsulation(KEM_ALG)
    kyber_pk = kem.generate_keypair()
    send_msg(tls_sock, MSG_KYBER_PK, kyber_pk)

    msg_type, kyber_ct = recv_msg(tls_sock)
    if msg_type != MSG_KYBER_CT:
        raise RuntimeError("Expected MSG_KYBER_CT")

    try:
        kyber_secret = kem.decap_secret(kyber_ct)  # typically 32 bytes
    except Exception:
        raise RuntimeError("KYBER_DECAP_FAILED")

    if not kyber_secret:
        raise RuntimeError("BAD_KYBER_SECRET")

    # ---- Transcript binding (auditable) ----
    transcript_hash = sha3_512(
        _LABEL_T +
        _LABEL_X + x_pk_s + x_pk_c +
        _LABEL_K + kyber_pk + kyber_ct
    )  # 64 bytes

    # ---- Hybrid secret (resilient composition) ----
    # Concatenation means: if one is later broken, the other still contributes entropy.
    hybrid_secret = x_secret + kyber_secret

    return hybrid_secret, transcript_hash


def client_hybrid_handshake(tls_sock):
    """
    Client hybrid (inside TLS):
      1) Receive server X25519 pub pkS
      2) Generate client X25519 (skC, pkC), send pkC, derive x_secret
      3) Receive Kyber pkK, encapsulate -> (ctK, k_secret), send ctK
      4) transcript_hash = SHA3-512( LABEL_T || X25519 pkS||pkC || Kyber pkK||ctK )
      5) hybrid_secret = x_secret || k_secret
    """
    # ---- X25519 ----
    msg_type, x_pk_s = recv_msg(tls_sock)
    if msg_type != MSG_X25519_S_PUB:
        raise RuntimeError("Expected MSG_X25519_S_PUB")
    _require_len(x_pk_s, 32, "BAD_X25519_SERVER_PUB")

    x_sk_c = X25519PrivateKey.generate()
    x_pk_c = x_sk_c.public_key().public_bytes_raw()
    _require_len(x_pk_c, 32, "BAD_X25519_CLIENT_PUB")

    send_msg(tls_sock, MSG_X25519_C_PUB, x_pk_c)

    try:
        x_pub_s = X25519PublicKey.from_public_bytes(x_pk_s)
        x_secret = x_sk_c.exchange(x_pub_s)  # 32 bytes
    except Exception:
        raise RuntimeError("X25519_EXCHANGE_FAILED")

    _require_len(x_secret, 32, "BAD_X25519_SECRET")

    # ---- Kyber768 (KEM) ----
    kem = KeyEncapsulation(KEM_ALG)

    msg_type, kyber_pk = recv_msg(tls_sock)
    if msg_type != MSG_KYBER_PK:
        raise RuntimeError("Expected MSG_KYBER_PK")

    try:
        kyber_ct, kyber_secret = kem.encap_secret(kyber_pk)
    except Exception:
        raise RuntimeError("KYBER_ENCAP_FAILED")

    if not kyber_secret:
        raise RuntimeError("BAD_KYBER_SECRET")

    send_msg(tls_sock, MSG_KYBER_CT, kyber_ct)

    # ---- Transcript binding (auditable) ----
    transcript_hash = sha3_512(
        _LABEL_T +
        _LABEL_X + x_pk_s + x_pk_c +
        _LABEL_K + kyber_pk + kyber_ct
    )  # 64 bytes

    hybrid_secret = x_secret + kyber_secret
    return hybrid_secret, transcript_hash
