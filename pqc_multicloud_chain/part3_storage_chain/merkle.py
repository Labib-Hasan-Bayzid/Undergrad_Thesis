# merkle.py
from __future__ import annotations
from crypto_core import sha3_512

def merkle_root_sha3_512(leaves: list[bytes]) -> bytes:
    """
    Merkle root over leaf hashes (already 64 bytes each).
    If 1 leaf => root = leaf.
    If odd count => duplicate last.
    Internal node = SHA3-512(left || right)
    """
    if not leaves:
        return b""
    level = leaves[:]
    while len(level) > 1:
        nxt = []
        i = 0
        while i < len(level):
            left = level[i]
            right = level[i + 1] if i + 1 < len(level) else level[i]
            nxt.append(sha3_512(left + right))
            i += 2
        level = nxt
    return level[0]
