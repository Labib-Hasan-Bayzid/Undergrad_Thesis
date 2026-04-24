import json
from pathlib import Path
from merkle import sha3_512, merkle_root_sha3_512

CLOUDS = ["cloud_A", "cloud_B", "cloud_C"]

def finalize(file_id: str):
    base = Path("cloud_A") / file_id
    mpath = base / "manifest.json"
    if not mpath.exists():
        raise SystemExit("manifest.json not found in cloud_A")

    manifest = json.loads(mpath.read_text())

    # read chunks from cloud_A
    chunk_hashes = []
    final_hasher_input = b""

    idx = 0
    while True:
        chunk_path = base / f"{idx:08d}.bin"
        if not chunk_path.exists():
            break

        blob = chunk_path.read_bytes()
        ct = blob[12:]  # skip nonce
        h = sha3_512(ct)

        chunk_hashes.append(h)
        final_hasher_input += ct
        idx += 1

    chunks_total = idx
    final_hash = sha3_512(final_hasher_input)
    merkle_root = merkle_root_sha3_512(chunk_hashes)

    manifest["chunks_total"] = chunks_total
    manifest["final_hash_sha3_512_hex"] = final_hash.hex()
    manifest["merkle_root_sha3_512_hex"] = merkle_root.hex()
    manifest["status"] = "COMPLETE"

    # ensure chunks list has per-chunk hashes (if missing)
    if "chunks" in manifest:
        for i in range(chunks_total):
            # if chunk dict exists but missing hash, add it
            if isinstance(manifest["chunks"][i], dict):
                if "chunk_hash_sha3_512_hex" not in manifest["chunks"][i]:
                    ct = (base / f"{i:08d}.bin").read_bytes()[12:]
                    manifest["chunks"][i]["chunk_hash_sha3_512_hex"] = sha3_512(ct).hex()

    # write to all clouds
    for c in CLOUDS:
        out = Path(c) / file_id / "manifest.json"
        out.write_text(json.dumps(manifest, indent=2))

    print("Finalized ✅")
    print("chunks_total:", chunks_total)
    print("merkle_root:", merkle_root.hex())
    print("final_hash:", final_hash.hex())

if __name__ == "__main__":
    fid = input("Enter file_id: ").strip()
    finalize(fid)
