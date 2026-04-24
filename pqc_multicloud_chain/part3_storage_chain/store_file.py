import os, json, uuid
from pathlib import Path

import psycopg
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from merkle import sha3_512, merkle_root_sha3_512

DB_DSN = "postgresql://abdullahadnan@127.0.0.1:5432/pqc_vault"
CHUNK_SIZE = 1024 * 1024
CLOUDS = ["cloud_A", "cloud_B", "cloud_C"]

def hkdf_sha3_512(ikm: bytes, salt: bytes, info: bytes, length: int) -> bytes:
    return HKDF(algorithm=hashes.SHA3_512(), length=length, salt=salt, info=info).derive(ikm)

def main():
    hx = os.environ.get("HYBRID_SECRET_HEX")
    if not hx:
        raise SystemExit("Set HYBRID_SECRET_HEX (32-byte hex) before running.")
    hybrid_secret = bytes.fromhex(hx)

    infile = input("Enter path of file to store: ").strip()
    inpath = Path(infile)
    if not inpath.exists():
        raise SystemExit("File not found.")

    file_id = uuid.uuid4()
    filename = inpath.name
    file_size = inpath.stat().st_size

    for c in CLOUDS:
        (Path(c) / str(file_id)).mkdir(parents=True, exist_ok=True)

    salt = os.urandom(32)
    file_key = hkdf_sha3_512(hybrid_secret, salt=salt, info=b"file-key", length=32)
    aesgcm = AESGCM(file_key)

    chunk_hashes = []
    final_hasher = hashes.Hash(hashes.SHA3_512())

    manifest = {
        "file_id": str(file_id),
        "filename": filename,
        "file_size": file_size,
        "chunk_size": CHUNK_SIZE,
        "kdf": "HKDF-SHA3-512",
        "enc": "AES-256-GCM",
        "salt_hex": salt.hex(),
        "chunks": [],
    }

    with inpath.open("rb") as f:
        idx = 0
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break

            aad = f"{file_id}:{idx}".encode()
            nonce = os.urandom(12)
            ct = aesgcm.encrypt(nonce, chunk, aad)

            ch = sha3_512(ct)
            chunk_hashes.append(ch)
            final_hasher.update(ct)

            for c in CLOUDS:
                (Path(c) / str(file_id) / f"{idx:08d}.bin").write_bytes(nonce + ct)

            manifest["chunks"].append({
                "index": idx,
                "ciphertext_len": len(ct),
                "chunk_hash_sha3_512_hex": ch.hex(),
            })
            idx += 1

    final_hash = final_hasher.finalize()
    merkle_root = merkle_root_sha3_512(chunk_hashes)

    manifest["chunks_total"] = len(chunk_hashes)
    manifest["final_hash_sha3_512_hex"] = final_hash.hex()
    manifest["merkle_root_sha3_512_hex"] = merkle_root.hex()

    for c in CLOUDS:
        (Path(c) / str(file_id) / "manifest.json").write_text(json.dumps(manifest, indent=2))

    with psycopg.connect(DB_DSN) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO files(file_id, filename, file_size, chunk_size, chunks_total, salt,
                                     merkle_root_sha3_512, final_hash_sha3_512)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                (file_id, filename, file_size, CHUNK_SIZE, len(chunk_hashes), salt, merkle_root, final_hash)
            )

            for chinfo in manifest["chunks"]:
                idx = chinfo["index"]
                blob = (Path("cloud_A") / str(file_id) / f"{idx:08d}.bin").read_bytes()
                nonce = blob[:12]
                ct = blob[12:]
                cur.execute(
                    """INSERT INTO chunks(file_id, chunk_index, nonce, ciphertext_len, chunk_hash_sha3_512)
                       VALUES (%s,%s,%s,%s,%s)""",
                    (file_id, idx, nonce, len(ct), bytes.fromhex(chinfo["chunk_hash_sha3_512_hex"]))
                )

            for c in CLOUDS:
                cur.execute(
                    "INSERT INTO replicas(file_id, cloud_name, status) VALUES (%s,%s,%s)",
                    (file_id, c, "STORED")
                )
        conn.commit()

    print("\nStored OK ✅")
    print("file_id:", file_id)
    print("chunks:", len(chunk_hashes))
    print("merkle_root:", merkle_root.hex())

if __name__ == "__main__":
    main()
