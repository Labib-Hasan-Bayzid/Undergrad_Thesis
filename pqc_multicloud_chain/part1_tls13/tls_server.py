import ssl
import socket

HOST = "127.0.0.1"
PORT = 8443

def main():
    # TLS server context
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3
    ctx.maximum_version = ssl.TLSVersion.TLSv1_3

    # Load cert + key
    ctx.load_cert_chain(certfile="server.crt", keyfile="server.key")

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM, 0) as sock:
        sock.bind((HOST, PORT))
        sock.listen(5)
        print(f"[server] Listening on {HOST}:{PORT} (TLS 1.3 only)")

        with ctx.wrap_socket(sock, server_side=True) as ssock:
            conn, addr = ssock.accept()
            with conn:
                print("[server] Client connected:", addr)
                print("[server] TLS version:", conn.version())
                data = conn.recv(4096)
                print("[server] Received:", data.decode(errors="ignore"))
                conn.sendall(b"OK from TLS 1.3 server")

if __name__ == "__main__":
    main()
