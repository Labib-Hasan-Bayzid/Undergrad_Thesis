# chain_metrics.py
import os, time, subprocess, re, json, shutil
from pathlib import Path

PY = os.environ.get("PYTHON", "python")
CHUNK_SIZE = 8 * 1024 * 1024  # 8 MB
CLOUDS = ["cloud_A", "cloud_B", "cloud_C"]
OUTDIR = Path("metrics_output")
OUTDIR.mkdir(exist_ok=True)

def run(cmd, input_text=None, check=False):
    t0 = time.perf_counter()
    p = subprocess.run(
        cmd,
        input=(input_text.encode() if input_text else None),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False
    )
    dt = time.perf_counter() - t0
    out = p.stdout.decode(errors="replace")
    if check and p.returncode != 0:
        raise RuntimeError(f"Command failed: {cmd}\n{out}")
    return dt, p.returncode, out

def mbps(nbytes, sec):
    return (nbytes / (1024 * 1024)) / sec if sec > 0 else 0.0

def extract_file_id(output: str):
    m = re.search(r"file_id:\s*([0-9a-fA-F-]{36})", output)
    return m.group(1) if m else None

def file_size(path: str) -> int:
    return Path(path).stat().st_size

def dir_size_bytes(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for p in path.rglob("*"):
        if p.is_file():
            total += p.stat().st_size
    return total

def cloud_file_dir(file_id: str, cloud: str) -> Path:
    return Path(cloud) / file_id

def choose_one_chunk_path(file_id: str, cloud: str) -> Path:
    # most likely 00000000.bin exists, but find robustly
    base = cloud_file_dir(file_id, cloud)
    if not base.exists():
        return None
    bins = sorted(base.glob("*.bin"))
    return bins[0] if bins else None

def tamper_flip_one_byte(path: Path):
    data = path.read_bytes()
    if len(data) == 0:
        return
    # flip last byte
    b = data[-1] ^ 0x01
    path.write_bytes(data[:-1] + bytes([b]))

def multi_cloud_consistency(file_id: str):
    # verifies by running verify_multicloud.py once and parsing status
    t, rc, out = run([PY, "verify_multicloud.py"], f"{file_id}\n")
    ok = ("✅ ALL CLOUDS VERIFIED" in out)
    return t, ok, out

def upload_new(file_path: str, crash_at: str):
    inp = f"new\n{crash_at}\n{file_path}\n"
    t, rc, out = run([PY, "resume_upload.py"], inp)
    fid = extract_file_id(out)
    return t, fid, out

def upload_resume(file_path: str, file_id: str):
    inp = f"resume\n\n{file_path}\n{file_id}\n"
    t, rc, out = run([PY, "resume_upload.py"], inp)
    return t, out

def finalize(file_id: str):
    t, rc, out = run([PY, "finalize_upload.py"], f"{file_id}\n")
    ok = ("✅ Finalized upload" in out) or ("Finalized" in out)
    return t, ok, out

def decrypt(file_id: str, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    inp = f"{file_id}\n{str(out_dir)}/\n"
    t, rc, out = run([PY, "decrypt_file_envelope.py"], inp)
    ok = ("✅ Decryption successful" in out)
    # extract output path
    m = re.search(r"Output file:\s*(.*)", out)
    dec_path = m.group(1).strip() if m else None
    return t, ok, dec_path, out

def sha256(path: str):
    t, rc, out = run(["shasum", "-a", "256", path])
    h = out.split()[0] if out.strip() else None
    return t, h, out

def kms_wrap_unwrap_microbench(iterations=200):
    # calls kms_test_wrap.py repeatedly
    # Expect it to print "DEK match: True"
    t0 = time.perf_counter()
    ok_count = 0
    for _ in range(iterations):
        t, rc, out = run([PY, "kms_test_wrap.py"])
        if "DEK match: True" in out:
            ok_count += 1
    dt = time.perf_counter() - t0
    avg_ms = (dt / iterations) * 1000
    return avg_ms, ok_count, iterations

def kms_rotate_time():
    t, rc, out = run([PY, "kms_rotate.py"])
    ok = ("✅ KEK rotation complete" in out) or ("rotation" in out.lower())
    return t, ok, out

def main():
    print("\n=== chain_metrics.py ===")
    file_path = input("File path to test: ").strip()
    crash_at = input("Crash simulation chunk index (blank for none): ").strip()
    size = file_size(file_path)

    # 1) Upload new
    t_up1, fid, out1 = upload_new(file_path, crash_at)
    print(out1)
    if not fid:
        print("❌ Could not parse file_id from output. Stop.")
        return

    # 2) If crashed, resume
    t_up2 = 0.0
    out2 = ""
    if crash_at != "":
        t_up2, out2 = upload_resume(file_path, fid)
        print(out2)

    # 3) Finalize
    t_fin, fin_ok, out3 = finalize(fid)
    print(out3)

    # 4) Verify time = integrity detection time
    t_ver, ver_ok, out4 = multi_cloud_consistency(fid)
    print(out4)

    # 5) Decrypt
    t_dec, dec_ok, dec_path, out5 = decrypt(fid, OUTDIR)
    print(out5)

    # 6) Correctness check (hash compare)
    sha_ok = False
    h1 = h2 = None
    if dec_path and Path(dec_path).exists():
        _, h1, _ = sha256(file_path)
        _, h2, _ = sha256(dec_path)
        sha_ok = (h1 == h2)

    # 7) Storage overhead (actual)
    # total stored bytes across all clouds for that file_id
    stored_total = sum(dir_size_bytes(cloud_file_dir(fid, c)) for c in CLOUDS)
    overhead_percent = ((stored_total - size) / size) * 100 if size > 0 else 0.0

    # 8) Tamper detection (flip 1 byte in cloud_B)
    # backup file to restore later
    tamper_cloud = "cloud_B"
    chunk_path = choose_one_chunk_path(fid, tamper_cloud)
    tamper_ok = None
    t_tamper_verify = 0.0
    tamper_out = ""
    if chunk_path and chunk_path.exists():
        backup = chunk_path.read_bytes()
        tamper_flip_one_byte(chunk_path)
        t_tamper_verify, tamper_ok, tamper_out = multi_cloud_consistency(fid)
        # after tamper, restore original
        chunk_path.write_bytes(backup)

    # 9) Resume efficiency
    # We estimate it like this:
    # full_upload_time_est = time to upload all bytes at measured upload speed
    # resume_savings = compare "upload new with crash + resume" vs "upload from scratch once"
    # But we DON'T have "from scratch" in this run unless user didn't crash.
    # So we do an extra baseline run (no crash) on same file:
    print("\n=== Baseline run (no crash) for resume efficiency ===")
    t_base, fid_base, out_base = upload_new(file_path, "")
    print(out_base)
    if fid_base:
        t_fin_b, _, _ = finalize(fid_base)
        t_ver_b, ok_b, _ = multi_cloud_consistency(fid_base)
    else:
        t_fin_b = t_ver_b = 0.0

    # Resume efficiency percent:
    # baseline_upload_time = t_base
    # resumed_total_upload_time = t_up1 + t_up2 (if crashed)
    if crash_at != "":
        resume_eff = (1 - ((t_up1 + t_up2) / t_base)) * 100 if t_base > 0 else 0.0
    else:
        resume_eff = 0.0  # no crash scenario

    # 10) Multi-cloud consistency rate
    # For this test: 1 pass check -> rate 100% if ver_ok else 0%
    consistency_rate = 100.0 if ver_ok else 0.0

    # 11) KMS overhead
    avg_wrap_ms, ok_count, iters = kms_wrap_unwrap_microbench(iterations=50)
    t_kms_rot, kms_rot_ok, kms_rot_out = kms_rotate_time()

    # Report
    upload_total = t_up1 + t_up2
    report = {
        "file_id_test": fid,
        "file_size_bytes": size,
        "chunk_size_bytes": CHUNK_SIZE,

        "upload_time_sec_total": upload_total,
        "upload_MBps": mbps(size, upload_total),

        "decrypt_time_sec": t_dec,
        "decrypt_MBps": mbps(size, t_dec),

        "integrity_detection_time_verify_sec": t_ver,
        "verify_pass": ver_ok,

        "tamper_test": {
            "tampered_cloud": tamper_cloud,
            "tamper_verify_time_sec": t_tamper_verify,
            "tamper_verify_pass": tamper_ok,  # should be False after tamper
            "tamper_output_excerpt": (tamper_out[:400] if tamper_out else None)
        },

        "resume_efficiency_percent": resume_eff,
        "baseline_upload_time_sec": t_base,

        "multi_cloud_consistency_rate_percent": consistency_rate,

        "storage_overhead": {
            "stored_total_bytes_all_clouds": stored_total,
            "overhead_percent_vs_plain": overhead_percent
        },

        "kms_overhead": {
            "avg_wrap_unwrap_ms_50iters": avg_wrap_ms,
            "wrap_unwrap_success": f"{ok_count}/{iters}",
            "kms_rotate_time_sec": t_kms_rot,
            "kms_rotate_ok": kms_rot_ok
        },

        "correctness": {
            "sha256_match": sha_ok,
            "sha256_original": h1,
            "sha256_decrypted": h2
        }
    }

    out_json = OUTDIR / "chain_metrics_report.json"
    out_json.write_text(json.dumps(report, indent=2))
    print("\n=== FINAL METRICS ===")
    print(json.dumps(report, indent=2))
    print(f"\n✅ Saved: {out_json}")

if __name__ == "__main__":
    main()
