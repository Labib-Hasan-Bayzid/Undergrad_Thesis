# tls_server.py
import ssl
import socket
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CLOUDS = [
    BASE_DIR / "cloud_A",
    BASE_DIR / "cloud_B",
    BASE_DIR / "cloud_C",
]

HOST = "127.0.0.1"
PORT = 8443


def pick_cloud_dir(file_id: str) -> Path:
    """
    Choose first cloud directory that has this file_id.
    """
    for c in CLOUDS:
        d = c / file_id
        if d.exists() and d.is_dir():
            return d
    return None


def send_json(sock, obj):
    data = json.dumps(obj).encode()
    sock.sendall(len(data).to_bytes(4, "big"))
    sock.sendall(data)


def recv_json(sock):
    hdr = sock.recv(4)
    if not hdr:
        return None
    size = int.from_bytes(hdr, "big")
    data = sock.recv(size)
    return json.loads(data.decode())


def recv_exact(sock, n):
    buf = b""
    while len(buf) < n:
        part = sock.recv(n - len(buf))
        if not part:
            raise ConnectionError("socket closed")
        buf += part
    return buf


def handle_download(sock, file_id: str):
    cloud_dir = pick_cloud_dir(file_id)
    if cloud_dir is None:
        send_json(sock, {"type": "ERROR", "reason": "file_not_found"})
        return

    chunk_files = sorted(cloud_dir.glob("*.bin"))
    if not chunk_files:
        send_json(sock, {"type": "ERROR", "reason": "no_chunks"})
        return

    send_json(
        sock,
        {
            "type": "DOWNLOAD_OK",
            "chunks_total": len(chunk_files),
        },
    )

    for f in chunk_files:
        blob = f.read_bytes()
        sock.sendall(len(blob).to_bytes(4, "big"))
        sock.sendall(blob)


def handle_client(conn: ssl.SSLSocket, addr):
    print(f"\n🔌 Connection from {addr}")
    print("✅ TLS 1.3 established")
    print("cipher:", conn.cipher())

    try:
        msg = recv_json(conn)
        if not msg:
            return

        mtype = msg.get("type")

        if mtype == "DOWNLOAD_REQUEST":
            file_id = msg.get("file_id")
            print(f"⬇️ DOWNLOAD_REQUEST file_id={file_id}")
            handle_download(conn, file_id)

        else:
            send_json(conn, {"type": "ERROR", "reason": "unsupported_request"})

    except Exception as e:
        print("❌ Error:", e)

    finally:
        conn.close()


def main():
    ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3

    # Self-signed certs are fine for thesis/demo
    ctx.load_cert_chain("server.crt", "server.key")

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM, 0) as s:
        s.bind((HOST, PORT))
        s.listen(5)

        print(f"✅ TLS server listening on {HOST}:{PORT}")

        while True:
            raw_sock, addr = s.accept()
            try:
                tls_conn = ctx.wrap_socket(raw_sock, server_side=True)
                handle_client(tls_conn, addr)
            except Exception as e:
                print("❌ TLS handshake failed:", e)


if __name__ == "__main__":
    main()
