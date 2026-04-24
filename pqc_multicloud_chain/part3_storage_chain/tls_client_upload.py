# tls_client_upload.py
import os
import ssl
import uuid
from pathlib import Path

from hybrid_session import client_handshake_over_tls, send_json, recv_json


DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024  # 8MB


def main():
    host = "127.0.0.1"
    port = 8443

    file_path = Path(input("File path to upload: ").strip()).expanduser()
    if not file_path.exists():
        print("File not found.")
        return

    file_id = str(uuid.uuid4())
    filename = file_path.name
    file_size = file_path.stat().st_size
    chunk_size = DEFAULT_CHUNK_SIZE

    ctx = ssl.create_default_context()
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3

    # For local self-signed testing:
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    import socket
    with socket.create_connection((host, port)) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as tls:
            print("✅ TLS 1.3 connected")
            print("cipher:", tls.cipher())

            # Hybrid handshake: Kyber inside TLS + channel binding nonces
            _ = client_handshake_over_tls(
                tls_sock=tls,
                file_id=file_id,
                filename=filename,
                file_size=file_size,
                chunk_size=chunk_size
            )

            # Send upload header
            send_json(tls, {
                "type": "UPLOAD_HEADER",
                "file_id": file_id,
                "filename": filename,
                "file_size": file_size,
                "chunk_size": chunk_size
            })

            # Stream bytes
            with file_path.open("rb") as f:
                while True:
                    b = f.read(1024 * 1024)  # send in 1MB network frames (not storage chunks)
                    if not b:
                        break
                    tls.sendall(b)

            resp = recv_json(tls)
            if resp.get("type") == "UPLOAD_OK":
                print("✅ Upload complete")
                print("file_id:", resp["file_id"])
                print("chunks_total:", resp["chunks_total"])
            else:
                print("❌ Unexpected response:", resp)


if __name__ == "__main__":
    main()
