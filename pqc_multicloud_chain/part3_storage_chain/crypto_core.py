# crypto_core.py
from __future__ import annotations
import os
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def sha3_512(data: bytes) -> bytes:
    h = hashes.Hash(hashes.SHA3_512())
    h.update(data)
    return h.finalize()

def encrypt_chunk(dek: bytes, file_id: str, chunk_index: int, plaintext: bytes, nonce: bytes) -> bytes:
    aad = f"{file_id}:{chunk_index}".encode()
    return AESGCM(dek).encrypt(nonce, plaintext, aad)

def decrypt_chunk(dek: bytes, file_id: str, chunk_index: int, ciphertext: bytes, nonce: bytes) -> bytes:
    aad = f"{file_id}:{chunk_index}".encode()
    return AESGCM(dek).decrypt(nonce, ciphertext, aad)

def gen_nonce() -> bytes:
    # 96-bit nonce for AES-GCM
    return os.urandom(12)
