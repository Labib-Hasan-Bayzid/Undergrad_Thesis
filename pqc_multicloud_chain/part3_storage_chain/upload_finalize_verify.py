#!/usr/bin/env python3
"""
upload_finalize_verify.py
Industry-friendly orchestrator:
1) runs resume_upload.py (new or resume)
2) runs finalize_upload.py
3) runs verify_multicloud.py
Optionally: asks if you want to decrypt after verify.

This file DOES NOT replace the core scripts.
It uses them as primitives (industry structure).
"""

from __future__ import annotations
import re
import sys
import subprocess
from pathlib import Path

UUID_RE = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"
)

BASE_DIR = Path(__file__).resolve().parent
RESUME_SCRIPT = BASE_DIR / "resume_upload.py"
FINALIZE_SCRIPT = BASE_DIR / "finalize_upload.py"
VERIFY_SCRIPT = BASE_DIR / "verify_multicloud.py"
DECRYPT_SCRIPT = BASE_DIR / "decrypt_file_envelope.py"


def run_script(script_path: Path, input_lines: list[str]) -> tuple[int, str, str]:
    """
    Run a python script as a subprocess, feed its interactive input via stdin,
    return (returncode, stdout, stderr).
    """
    cmd = [sys.executable, str(script_path)]
    proc = subprocess.run(
        cmd,
        input="\n".join(input_lines) + "\n",
        text=True,
        capture_output=True,
    )
    return proc.returncode, proc.stdout, proc.stderr


def extract_last_file_id(output: str) -> str | None:
    """
    Extract the last UUID printed in output.
    We pick the last match because scripts can print multiple UUIDs.
    """
    matches = UUID_RE.findall(output)
    return matches[-1] if matches else None


def require_file(path: Path) -> None:
    if not path.exists():
        print(f"❌ Missing required file: {path.name}")
        print("Make sure you're inside part3_storage_chain and the scripts exist.")
        sys.exit(1)


def main():
    # Basic sanity
    require_file(RESUME_SCRIPT)
    require_file(FINALIZE_SCRIPT)
    require_file(VERIFY_SCRIPT)

    print("\n=== upload_finalize_verify.py ===")
    print("This will do: Upload → Finalize → Verify (multi-cloud)\n")

    mode = input("Mode (new/resume): ").strip().lower()
    if mode not in ("new", "resume"):
        print("❌ Mode must be 'new' or 'resume'")
        sys.exit(1)

    crash = input("Simulate crash at chunk index? (blank for none): ").strip()
    file_path = input("File path to upload (same file for resume): ").strip()

    file_id = None

    if mode == "new":
        # Feed resume_upload.py exactly what it expects (interactive)
        input_lines = [
            "new",
            crash,
            file_path,
        ]
        rc, out, err = run_script(RESUME_SCRIPT, input_lines)
        print(out, end="")
        if err.strip():
            print(err, end="", file=sys.stderr)

        if rc != 0:
            print("❌ resume_upload.py failed (new).")
            sys.exit(rc)

        file_id = extract_last_file_id(out)
        if not file_id:
            print("❌ Could not detect file_id from resume_upload output.")
            print("Please scroll your terminal output and find the file_id line.")
            sys.exit(1)

        # If crash was simulated, upload is incomplete, user must run resume step
        if crash != "":
            print("\n💥 Crash simulation was enabled, so upload is IN_PROGRESS.")
            print("Now continuing automatically in resume mode...\n")

            # auto-resume immediately
            input_lines = [
                "resume",
                "",  # no crash during resume unless user wants (keep blank)
                file_path,
                file_id,
            ]
            rc, out2, err2 = run_script(RESUME_SCRIPT, input_lines)
            print(out2, end="")
            if err2.strip():
                print(err2, end="", file=sys.stderr)
            if rc != 0:
                print("❌ resume_upload.py failed (auto-resume).")
                sys.exit(rc)

    else:
        # resume mode
        file_id = input("Enter file_id to resume: ").strip()
        input_lines = [
            "resume",
            crash,
            file_path,
            file_id,
        ]
        rc, out, err = run_script(RESUME_SCRIPT, input_lines)
        print(out, end="")
        if err.strip():
            print(err, end="", file=sys.stderr)

        if rc != 0:
            print("❌ resume_upload.py failed (resume).")
            sys.exit(rc)

    # Finalize
    print("\n=== Finalizing upload ===\n")
    rc, out, err = run_script(FINALIZE_SCRIPT, [file_id])
    print(out, end="")
    if err.strip():
        print(err, end="", file=sys.stderr)
    if rc != 0:
        print("❌ finalize_upload.py failed.")
        sys.exit(rc)

    # Verify
    print("\n=== Verifying multi-cloud integrity ===\n")
    rc, out, err = run_script(VERIFY_SCRIPT, [file_id])
    print(out, end="")
    if err.strip():
        print(err, end="", file=sys.stderr)
    if rc != 0:
        print("❌ verify_multicloud.py failed.")
        sys.exit(rc)

    if "✅ ALL CLOUDS VERIFIED" not in out:
        print("❌ Verification did not confirm success.")
        print("Stop here. Do NOT decrypt until integrity is OK.")
        sys.exit(2)

    print("\n✅ Pipeline complete: Upload → Finalize → Verify")

    # Optional decrypt
    want_dec = input("\nDecrypt now? (y/n): ").strip().lower()
    if want_dec == "y":
        if not DECRYPT_SCRIPT.exists():
            print("❌ decrypt_file_envelope.py not found, cannot decrypt.")
            sys.exit(1)

        out_path = input("Output file path (file OR folder): ").strip()
        print("\n=== Decrypting ===\n")
        rc, out, err = run_script(DECRYPT_SCRIPT, [file_id, out_path])
        print(out, end="")
        if err.strip():
            print(err, end="", file=sys.stderr)
        if rc != 0:
            print("❌ decrypt_file_envelope.py failed.")
            sys.exit(rc)

        print("\n✅ Decrypt complete.")
    else:
        print("\n✅ Done. You can decrypt later using decrypt_file_envelope.py")


if __name__ == "__main__":
    main()
