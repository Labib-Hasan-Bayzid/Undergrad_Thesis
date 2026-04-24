import ssl
import socket

HOST = "127.0.0.1"
PORT = 8443

def main():
    # TLS client context
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3
    ctx.maximum_version = ssl.TLSVersion.TLSv1_3

    # Trust our self-signed cert for this demo
    ctx.load_verify_locations(cafile="server.crt")
    ctx.check_hostname = False  # because self-signed CN=localhost and we connect 127.0.0.1
    ctx.verify_mode = ssl.CERT_REQUIRED

    with socket.create_connection((HOST, PORT)) as sock:
        with ctx.wrap_socket(sock, server_hostname="localhost") as ssock:
            print("[client] TLS version:", ssock.version())
            ssock.sendall(b"Hello over TLS 1.3")
            reply = ssock.recv(4096)
            print("[client] Reply:", reply.decode(errors="ignore"))

if __name__ == "__main__":
    main()
