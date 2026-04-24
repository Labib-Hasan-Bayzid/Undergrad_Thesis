# visualize_encryption.py
# Auto: find original image path, auto-decrypt to output/, visualize, and save figure PNG.
# IMPORTANT: does NOT modify cryptography chain; only calls existing decrypt_file_envelope.py logic.

import os
import json
import subprocess
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
from PIL import Image

CLOUD = "cloud_A"

# Where to save the visualization output image
DEFAULT_OUTPUT_DIR = Path("/Users/abdullahadnan/Desktop/pqc_multicloud_chain/part3_storage_chain/output").expanduser()

# Optional: auto-search original images in these folders
SEARCH_ORIGINAL_DIRS = [
    Path.cwd(),
    Path.cwd() / "output",
    Path.home() / "Desktop",
    Path.home() / "Downloads",
]

def read_manifest(file_id: str) -> dict:
    p = Path(CLOUD) / file_id / "manifest.json"
    if not p.exists():
        raise FileNotFoundError(f"manifest.json not found: {p}")
    return json.loads(p.read_text())

def read_all_cipher_bytes(file_id: str) -> bytes:
    folder = Path(CLOUD) / file_id
    chunk_files = sorted(folder.glob("*.bin"))
    if not chunk_files:
        raise FileNotFoundError(f"No .bin chunks found in {folder}")
    data = b"".join(cf.read_bytes() for cf in chunk_files)
    if len(data) == 0:
        raise RuntimeError("Cipher bytes are empty (chunk file contains 0 bytes).")
    return data

def load_image_rgb(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    return np.array(img, dtype=np.uint8)

def hist_rgb(img_arr: np.ndarray):
    h_r = np.histogram(img_arr[:, :, 0].flatten(), bins=256, range=(0, 255))[0]
    h_g = np.histogram(img_arr[:, :, 1].flatten(), bins=256, range=(0, 255))[0]
    h_b = np.histogram(img_arr[:, :, 2].flatten(), bins=256, range=(0, 255))[0]
    return h_r, h_g, h_b

def resolve_original_path(filename: str) -> Path | None:
    # Search in common folders first
    for base in SEARCH_ORIGINAL_DIRS:
        candidate = (base / filename).expanduser()
        if candidate.exists():
            return candidate
    # As last resort: check absolute path given by filename (if user had stored absolute)
    p = Path(filename).expanduser()
    if p.exists():
        return p
    return None

def decrypted_output_path(output_dir: Path, filename: str) -> Path:
    return output_dir / filename

def auto_decrypt(file_id: str, out_dir: Path) -> Path:
    """
    Calls decrypt_file_envelope.py automatically (no prompts),
    saving output into out_dir with original filename.
    This does NOT change crypto. It just automates calling your existing script.
    """
    out_dir.mkdir(parents=True, exist_ok=True)

    # We feed inputs to decrypt_file_envelope.py:
    #   file_id
    #   output folder path
    # decrypt_file_envelope.py already supports folder input and auto-filename.
    cmd = ["python", "decrypt_file_envelope.py"]

    proc = subprocess.run(
        cmd,
        input=f"{file_id}\n{str(out_dir)}/\n",
        text=True,
        capture_output=True
    )

    if proc.returncode != 0:
        print("❌ decrypt_file_envelope.py failed.")
        print(proc.stdout)
        print(proc.stderr)
        raise RuntimeError("Auto-decrypt failed. Check error above.")

    # Try to detect output file path from stdout
    # It prints: "📄 Output file: <path>"
    out_path = None
    for line in proc.stdout.splitlines():
        if "Output file:" in line:
            out_path = line.split("Output file:")[-1].strip()
            break

    if out_path:
        p = Path(out_path).expanduser()
        if p.exists():
            return p

    # Fallback: expected output location
    # We'll read manifest to get filename and return out_dir/filename
    m = read_manifest(file_id)
    fn = m.get("filename", f"{file_id}_decrypted.bin")
    p = out_dir / fn
    if p.exists():
        return p

    raise FileNotFoundError("Decryption ran but output file could not be located.")

def build_cipher_preview(orig_shape, cipher_bytes: bytes) -> np.ndarray:
    H, W, C = orig_shape
    need = H * W * C
    if len(cipher_bytes) >= need:
        preview = cipher_bytes[:need]
    else:
        reps = (need // len(cipher_bytes)) + 1
        preview = (cipher_bytes * reps)[:need]
    return np.frombuffer(preview, dtype=np.uint8).reshape((H, W, C))

def main():
    print("\n=== visualize_encryption.py (AUTO) ===")
    file_id = input("Enter file_id: ").strip()

    m = read_manifest(file_id)
    filename = m.get("filename")
    if not filename:
        raise RuntimeError("manifest.json missing 'filename'")

    # 1) Auto-locate original image (or ask once if not found)
    orig_path = resolve_original_path(filename)
    if orig_path is None:
        print(f"⚠️ Could not auto-find original image: {filename}")
        user_path = input("Give full path to original image: ").strip()
        orig_path = Path(user_path).expanduser()
        if not orig_path.exists():
            raise FileNotFoundError(f"Original image not found: {orig_path}")

    # 2) Auto-decrypt to output folder (no manual prompt)
    out_dir = DEFAULT_OUTPUT_DIR
    dec_path = auto_decrypt(file_id, out_dir)

    # 3) Build visualization
    orig = load_image_rgb(orig_path)
    cipher_bytes = read_all_cipher_bytes(file_id)
    cipher_img = build_cipher_preview(orig.shape, cipher_bytes)
    dec = load_image_rgb(dec_path)

    hr_o, hg_o, hb_o = hist_rgb(orig)
    hr_c, hg_c, hb_c = hist_rgb(cipher_img)
    hr_d, hg_d, hb_d = hist_rgb(dec)

    plt.figure(figsize=(14, 8))

    # Images
    plt.subplot(2, 3, 1)
    plt.title("Plain Image (RGB)")
    plt.imshow(orig)
    plt.axis("off")

    plt.subplot(2, 3, 2)
    plt.title("Cipher Preview (Noise, RGB)")
    plt.imshow(cipher_img)
    plt.axis("off")

    plt.subplot(2, 3, 3)
    plt.title("Decrypted Image (RGB)")
    plt.imshow(dec)
    plt.axis("off")

    # Histograms
    plt.subplot(2, 3, 4)
    plt.title("Histogram (Plain RGB)")
    plt.plot(hr_o, label="R")
    plt.plot(hg_o, label="G")
    plt.plot(hb_o, label="B")
    plt.legend()

    plt.subplot(2, 3, 5)
    plt.title("Histogram (Cipher Preview RGB)")
    plt.plot(hr_c, label="R")
    plt.plot(hg_c, label="G")
    plt.plot(hb_c, label="B")
    plt.legend()

    plt.subplot(2, 3, 6)
    plt.title("Histogram (Decrypted RGB)")
    plt.plot(hr_d, label="R")
    plt.plot(hg_d, label="G")
    plt.plot(hb_d, label="B")
    plt.legend()

    plt.tight_layout()

    # 4) Auto-save the figure into output folder
    out_dir.mkdir(parents=True, exist_ok=True)
    fig_path = out_dir / f"{file_id}_visualization.png"
    plt.savefig(fig_path, dpi=200)
    print(f"\n✅ Figure saved automatically:\n{fig_path}")

    # 5) Still show window (optional)
    plt.show()

    print("\n✅ Done (AUTO): original → decrypt → visualize → saved")

if __name__ == "__main__":
    main()
