# wrap_keys.py
from __future__ import annotations
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def hkdf_sha3_512(ikm: bytes, salt: bytes, info: bytes, length: int) -> bytes:
    return HKDF(
        algorithm=hashes.SHA3_512(),
        length=length,
        salt=salt,
        info=info,
    ).derive(ikm)

def make_wrap_key(hybrid_secret: bytes, kms_master: bytes, wrap_salt: bytes, kek_version: int = 1) -> bytes:
    """
    KEK derivation (wrap key).
    Industry grade detail:
      - 'info' binds kek_version so rotations are cryptographically meaningful.
    """
    ikm = hybrid_secret + kms_master
    info = f"wrap-dek-v1|kek_version={kek_version}".encode()
    return hkdf_sha3_512(ikm=ikm, salt=wrap_salt, info=info, length=32)  # 256-bit KEK

def wrap_dek(dek: bytes, wrap_key: bytes, nonce: bytes, aad: bytes) -> bytes:
    return AESGCM(wrap_key).encrypt(nonce, dek, aad)

def unwrap_dek(wrapped_dek: bytes, wrap_key: bytes, nonce: bytes, aad: bytes) -> bytes:
    return AESGCM(wrap_key).decrypt(nonce, wrapped_dek, aad)
