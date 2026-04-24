# merkle_utils.py
from __future__ import annotations
from typing import List
from crypto_utils import sha3_512

def build_merkle_root_sha3_512(leaves: List[bytes]) -> bytes:
    """
    Deterministic Merkle root (SHA3-512).
    - leaves: list of 64-byte hashes (sha3_512 outputs)
    - if odd count, duplicate last
    """
    if not leaves:
        raise ValueError("Cannot build Merkle root from empty list")

    level = leaves[:]
    while len(level) > 1:
        nxt = []
        i = 0
        while i < len(level):
            left = level[i]
            right = level[i + 1] if (i + 1) < len(level) else level[i]
            nxt.append(sha3_512(left + right))
            i += 2
        level = nxt
    return level[0]
