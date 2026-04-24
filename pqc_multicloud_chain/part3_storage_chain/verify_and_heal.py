import json
import shutil
from pathlib import Path

import psycopg
from merkle import sha3_512, merkle_root_sha3_512

DB_DSN = "postgresql://abdullahadnan@127.0.0.1:5432/pqc_vault"
CLOUDS = ["cloud_A", "cloud_B", "cloud_C"]

def read_manifest(cloud: str, file_id: str) -> dict:
    p = Path(cloud) / file_id / "manifest.json"
    if not p.exists():
        raise FileNotFoundError(f"{cloud}: manifest.json missing")
    return json.loads(p.read_text())

def read_chunk_blob(cloud: str, file_id: str, idx: int) -> bytes:
    p = Path(cloud) / file_id / f"{idx:08d}.bin"
    if not p.exists():
        raise FileNotFoundError(f"{cloud}: chunk {idx} missing")
    return p.read_bytes()

def verify_cloud(cloud: str, file_id: str) -> dict:
    issues = []
    m = read_manifest(cloud, file_id)

    # strict requirements
    if m.get("status") != "COMPLETE":
        issues.append(f"{cloud}: status not COMPLETE")
    if m.get("chunks_total") is None:
        issues.append(f"{cloud}: missing chunks_total")
    if "merkle_root_sha3_512_hex" not in m:
        issues.append(f"{cloud}: missing merkle_root_sha3_512_hex")

    if issues:
        return {"cloud": cloud, "ok": False, "issues": issues, "bad_chunks": []}

    expected_chunks = int(m["chunks_total"])
    expected_root = m["merkle_root_sha3_512_hex"]

    leaf_hashes = []
    bad_chunks = []

    for i in range(expected_chunks):
        try:
            blob = read_chunk_blob(cloud, file_id, i)
        except Exception as e:
            issues.append(str(e))
            bad_chunks.append(i)
            continue

        if len(blob) < 13:
            issues.append(f"{cloud}: chunk {i} too small/corrupt")
            bad_chunks.append(i)
            continue

        ct = blob[12:]
        actual = sha3_512(ct).hex()

        # compare to manifest chunk hash if present
        try:
            expected_h = m["chunks"][i]["chunk_hash_sha3_512_hex"]
            if actual != expected_h:
                issues.append(f"{cloud}: chunk {i} hash mismatch")
                bad_chunks.append(i)
        except Exception:
            issues.append(f"{cloud}: manifest missing chunk hash at {i}")
            bad_chunks.append(i)

        leaf_hashes.append(bytes.fromhex(actual))

    if len(leaf_hashes) == expected_chunks:
        computed_root = merkle_root_sha3_512(leaf_hashes).hex()
        if computed_root != expected_root:
            issues.append(f"{cloud}: merkle root mismatch")
    else:
        computed_root = None
        issues.append(f"{cloud}: cannot compute root due to missing/bad chunks")

    ok = len(issues) == 0
    return {"cloud": cloud, "ok": ok, "issues": issues, "bad_chunks": sorted(set(bad_chunks))}

def db_set_replica_status(conn, file_id: str, cloud: str, status: str, detail: str = ""):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO replicas(file_id, cloud_name, status, last_checked)
               VALUES (%s,%s,%s,now())
               ON CONFLICT (file_id, cloud_name)
               DO UPDATE SET status=EXCLUDED.status, last_checked=now()""",
            (file_id, cloud, status)
        )
        # optional audit log table
        cur.execute(
            """INSERT INTO integrity_events(file_id, cloud_name, event_type, detail)
               VALUES (%s,%s,%s,%s)""",
            (file_id, cloud, status, detail[:5000])
        )

def heal_cloud(file_id: str, target_cloud: str, source_cloud: str, chunks_to_fix: list[int]):
    for idx in chunks_to_fix:
        src = Path(source_cloud) / file_id / f"{idx:08d}.bin"
        dst = Path(target_cloud) / file_id / f"{idx:08d}.bin"
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    # keep manifest consistent too
    shutil.copy2(Path(source_cloud) / file_id / "manifest.json",
                 Path(target_cloud) / file_id / "manifest.json")

def choose_source(results: list[dict]) -> str | None:
    # choose any cloud that is OK as source
    for r in results:
        if r["ok"]:
            return r["cloud"]
    return None

def main():
    file_id = input("Enter file_id: ").strip()

    results = [verify_cloud(c, file_id) for c in CLOUDS]

    print("\n=== Verify results ===")
    for r in results:
        print(f"{r['cloud']}: {'OK ✅' if r['ok'] else 'FAIL ❌'}")
        if r["issues"]:
            for x in r["issues"]:
                print("  -", x)

    source = choose_source(results)
    if source is None:
        print("\nNo healthy replica found. Cannot heal automatically.")
        return

    # Update DB statuses + attempt heal for failed clouds
    with psycopg.connect(DB_DSN) as conn:
        for r in results:
            if r["ok"]:
                db_set_replica_status(conn, file_id, r["cloud"], "VERIFIED", "Verified OK")
            else:
                detail = "; ".join(r["issues"])
                db_set_replica_status(conn, file_id, r["cloud"], "CORRUPT", detail)

        conn.commit()

        # Heal corrupted clouds from a healthy source
        for r in results:
            if not r["ok"]:
                print(f"\nHealing {r['cloud']} from {source} ...")
                heal_cloud(file_id, r["cloud"], source, r["bad_chunks"] or [0])  # default chunk 0 if unknown
                db_set_replica_status(conn, file_id, r["cloud"], "REPAIRED", f"Repaired from {source}")
                conn.commit()

    # Re-verify after heal
    print("\n=== Re-verify after heal ===")
    results2 = [verify_cloud(c, file_id) for c in CLOUDS]
    all_ok = True
    for r in results2:
        print(f"{r['cloud']}: {'OK ✅' if r['ok'] else 'FAIL ❌'}")
        if not r["ok"]:
            all_ok = False
            for x in r["issues"]:
                print("  -", x)

    if all_ok:
        print("\n✅ ALL CLOUDS VERIFIED AFTER HEAL")
        with psycopg.connect(DB_DSN) as conn:
            for c in CLOUDS:
                db_set_replica_status(conn, file_id, c, "STORED", "Healthy after re-verify")
            conn.commit()
    else:
        print("\n❌ Some clouds still failing after heal")

if __name__ == "__main__":
    main()
