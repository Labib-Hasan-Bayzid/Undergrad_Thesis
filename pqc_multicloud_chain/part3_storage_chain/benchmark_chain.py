# benchmark_chain.py
import os, time, subprocess, json, re
from pathlib import Path

PY = os.environ.get("PYTHON", "python")
CHUNK_SIZE = 8 * 1024 * 1024  # 8 MB
OUTDIR = Path("bench_output")
OUTDIR.mkdir(exist_ok=True)

def run(cmd, input_text=None):
    t0 = time.perf_counter()
    p = subprocess.run(
        cmd,
        input=(input_text.encode() if input_text else None),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False
    )
    dt = time.perf_counter() - t0
    return dt, p.returncode, p.stdout.decode(errors="replace")

def mbps(bytes_count, seconds):
    if seconds <= 0: return 0.0
    return (bytes_count / (1024*1024)) / seconds

def extract_file_id(output: str):
    # looks for: file_id: xxxx
    m = re.search(r"file_id:\s*([0-9a-fA-F-]{36})", output)
    return m.group(1) if m else None

def file_size(path):
    return Path(path).stat().st_size

def main():
    print("=== Benchmark: PQC Multi-Cloud Chain ===")
    file_path = input("File path to test: ").strip()
    crash_at = input("Simulate crash at chunk index (blank for none): ").strip()

    size = file_size(file_path)
    print(f"File size: {size} bytes ({size/(1024*1024):.2f} MB)")
    print(f"Chunk size: {CHUNK_SIZE} bytes")

    # 1) NEW upload (possibly crash)
    new_inputs = f"new\n{crash_at}\n{file_path}\n"
    t_upload1, rc1, out1 = run([PY, "resume_upload.py"], new_inputs)
    fid = extract_file_id(out1)
    print(out1)
    if not fid:
        print("❌ Could not extract file_id from resume_upload.py output.")
        return

    # If crash simulated, do RESUME upload
    t_upload2 = 0.0
    if crash_at != "":
        resume_inputs = f"resume\n\n{file_path}\n{fid}\n"
        t_upload2, rc2, out2 = run([PY, "resume_upload.py"], resume_inputs)
        print(out2)

    # 2) Finalize
    fin_inputs = f"{fid}\n"
    t_finalize, rc3, out3 = run([PY, "finalize_upload.py"], fin_inputs)
    print(out3)

    # 3) Verify
    ver_inputs = f"{fid}\n"
    t_verify, rc4, out4 = run([PY, "verify_multicloud.py"], ver_inputs)
    print(out4)

    # 4) Decrypt
    dec_out = OUTDIR.as_posix() + "/"
    dec_inputs = f"{fid}\n{dec_out}\n"
    t_decrypt, rc5, out5 = run([PY, "decrypt_file_envelope.py"], dec_inputs)
    print(out5)

    # Find decrypted filename from output
    m = re.search(r"Output file:\s*(.*)", out5)
    dec_path = m.group(1).strip() if m else None

    # 5) SHA256 compare (optional)
    if dec_path and Path(dec_path).exists():
        t_sha, rc_sha, out_sha = run(["shasum", "-a", "256", file_path])
        t_sha2, rc_sha2, out_sha2 = run(["shasum", "-a", "256", dec_path])
        same = out_sha.split()[0] == out_sha2.split()[0]
    else:
        same = False

    total_upload = t_upload1 + t_upload2
    print("\n=== RESULTS SUMMARY ===")
    print(f"file_id: {fid}")
    print(f"upload_time_total_sec: {total_upload:.4f}")
    print(f"upload_throughput_MBps: {mbps(size, total_upload):.2f}")
    print(f"finalize_time_sec: {t_finalize:.4f}")
    print(f"verify_time_sec: {t_verify:.4f}")
    print(f"decrypt_time_sec: {t_decrypt:.4f}")
    print(f"decrypt_throughput_MBps: {mbps(size, t_decrypt):.2f}")
    print(f"decrypt_matches_original_sha256: {same}")

    # Rough storage overhead estimate per chunk:
    # AES-GCM adds 16B tag + 12B nonce (we store nonce) => +28 bytes per chunk (ciphertext tag included in bin)
    num_chunks = (size + CHUNK_SIZE - 1) // CHUNK_SIZE
    overhead_bytes = num_chunks * 28
    print(f"estimated_crypto_overhead_bytes: {overhead_bytes}")
    print(f"estimated_overhead_percent: {100*overhead_bytes/size:.6f}%")

    # Save JSON report
    report = {
        "file_id": fid,
        "file_size_bytes": size,
        "chunk_size_bytes": CHUNK_SIZE,
        "chunks": num_chunks,
        "upload_time_sec": total_upload,
        "upload_MBps": mbps(size, total_upload),
        "finalize_time_sec": t_finalize,
        "verify_time_sec": t_verify,
        "decrypt_time_sec": t_decrypt,
        "decrypt_MBps": mbps(size, t_decrypt),
        "sha256_match": same,
        "estimated_overhead_bytes": overhead_bytes,
        "estimated_overhead_percent": 100*overhead_bytes/size
    }
    Path(OUTDIR/"bench_report.json").write_text(json.dumps(report, indent=2))
    print(f"\n✅ Saved: {OUTDIR/'bench_report.json'}")

if __name__ == "__main__":
    main()
