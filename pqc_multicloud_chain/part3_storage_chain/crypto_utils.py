from __future__ import annotations

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


# ---------------------------------------------------
# SHA3-512 (raw hash)
# ---------------------------------------------------
def sha3_512(data: bytes) -> bytes:
    digest = hashes.Hash(hashes.SHA3_512())
    digest.update(data)
    return digest.finalize()


# ---------------------------------------------------
# HKDF-SHA3-512
# ---------------------------------------------------
def hkdf_sha3_512(
    ikm: bytes,
    salt: bytes,
    info: bytes,
    length: int = 32,
) -> bytes:
    hkdf = HKDF(
        algorithm=hashes.SHA3_512(),
        length=length,
        salt=salt,
        info=info,
    )
    return hkdf.derive(ikm)


# ---------------------------------------------------
# AES-256-GCM helpers
# ---------------------------------------------------
def aes_gcm_encrypt(key: bytes, nonce: bytes, plaintext: bytes, aad: bytes | None = None) -> tuple[bytes, bytes]:
    """
    Returns (ciphertext, tag)
    """
    if len(key) != 32:
        raise ValueError("AES key must be 32 bytes")
    if len(nonce) != 12:
        raise ValueError("AES-GCM nonce must be 12 bytes")
    aes = AESGCM(key)
    ct = aes.encrypt(nonce, plaintext, aad)
    return ct[:-16], ct[-16:]


def aes_gcm_decrypt(key: bytes, nonce: bytes, ciphertext: bytes, tag: bytes, aad: bytes | None = None) -> bytes:
    """
    Verifies tag. Raises InvalidTag if wrong key/nonce/tag/ciphertext/aad.
    """
    if len(key) != 32:
        raise ValueError("AES key must be 32 bytes")
    if len(nonce) != 12:
        raise ValueError("AES-GCM nonce must be 12 bytes")
    if len(tag) != 16:
        raise ValueError("AES-GCM tag must be 16 bytes")
    aes = AESGCM(key)
    return aes.decrypt(nonce, ciphertext + tag, aad)
