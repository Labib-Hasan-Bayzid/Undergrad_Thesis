# crypto_kdf.py
from __future__ import annotations
from crypto_utils import hkdf_sha3_512, sha3_512

def derive_dek(
    hybrid_secret: bytes,
    wrap_salt: bytes,
    aad_salt: bytes,
    transcript_hash: bytes,
    info: bytes,
) -> bytes:
    """
    Deterministic DEK derivation.
    Output: 32 bytes (AES-256)
    """
    if not all([hybrid_secret, wrap_salt, aad_salt, transcript_hash]):
        raise RuntimeError("Missing KDF inputs")

    material = sha3_512(
        hybrid_secret
        + wrap_salt
        + aad_salt
        + transcript_hash
    )

    dek = hkdf_sha3_512(
        material,
        salt=wrap_salt,
        info=info,
    )

    if len(dek) != 32:
        raise RuntimeError("DEK length invalid")

    return dek
