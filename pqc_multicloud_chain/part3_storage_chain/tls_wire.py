# tls_wire.py
import json
import socket
from typing import Tuple, Dict, Any, Optional

from resource_limits import MAX_WIRE_MSG_BYTES

# -------------------------
# Protocol versioning
# -------------------------
PROTO_VERSION = 2
SUPPORTED_MIN = 2
SUPPORTED_MAX = 2

# -------------------------
# Message types (1 byte)
# -------------------------
MSG_HELLO = 1
MSG_ERROR = 2

MSG_GET_FILE = 10
MSG_FILE_META = 11
MSG_FILE_CHUNK = 12
MSG_FILE_END = 13
MSG_DONE = 14

# In-band PQ/Hybrid handshake (inside TLS) - upload path
MSG_KYBER_PK = 20
MSG_KYBER_CT = 21
MSG_X25519_S_PUB = 22
MSG_X25519_C_PUB = 23

# NEW: Capability-token auth for download path
MSG_AUTH_REQ = 30
MSG_AUTH_TOKEN = 31

# -------------------------
# Wire format:
#   [1 byte type][4 bytes len big-endian][payload bytes]
# -------------------------

def set_socket_timeouts(sock: socket.socket, seconds: Optional[float]) -> None:
    if seconds is None:
        return
    sock.settimeout(float(seconds))

def _recv_exact(sock: socket.socket, n: int) -> bytes:
    if n < 0:
        raise ValueError("BAD_LENGTH")
    buf = bytearray()
    remaining = n
    while remaining:
        chunk = sock.recv(remaining)
        if not chunk:
            raise ConnectionError("Socket closed during recv")
        buf.extend(chunk)
        remaining -= len(chunk)
    return bytes(buf)

def send_msg(sock: socket.socket, msg_type: int, payload: bytes) -> None:
    if payload is None:
        payload = b""
    if len(payload) > MAX_WIRE_MSG_BYTES:
        raise RuntimeError("WIRE_PAYLOAD_TOO_LARGE")
    header = bytes([msg_type]) + len(payload).to_bytes(4, "big")
    sock.sendall(header + payload)

def recv_msg(sock: socket.socket) -> Tuple[int, bytes]:
    header = _recv_exact(sock, 5)
    msg_type = header[0]
    length = int.from_bytes(header[1:], "big")
    if length < 0 or length > MAX_WIRE_MSG_BYTES:
        raise RuntimeError("WIRE_LENGTH_TOO_LARGE")
    payload = _recv_exact(sock, length) if length else b""
    return msg_type, payload

def _json_dumps(obj: Dict[str, Any]) -> bytes:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

def _json_loads(payload: bytes) -> Dict[str, Any]:
    if not payload:
        return {}
    return json.loads(payload.decode("utf-8"))

def send_error(sock: socket.socket, code: str, message: str = "", *, details: Optional[Dict[str, Any]] = None) -> None:
    obj = {"code": code, "message": message or code}
    if details:
        obj["details"] = details
    send_msg(sock, MSG_ERROR, _json_dumps(obj))

def recv_error(payload: bytes) -> Dict[str, Any]:
    try:
        return _json_loads(payload)
    except Exception:
        return {"code": "MALFORMED_ERROR", "message": "Server sent invalid error payload"}

def client_send_hello(sock: socket.socket, *, client_name: str, features: Optional[list] = None) -> None:
    hello = {"proto": PROTO_VERSION, "client": client_name, "features": features or []}
    send_msg(sock, MSG_HELLO, _json_dumps(hello))

def server_handle_hello(sock: socket.socket) -> Dict[str, Any]:
    msg_type, payload = recv_msg(sock)
    if msg_type != MSG_HELLO:
        raise RuntimeError("Expected MSG_HELLO as first message after TLS")

    hello = _json_loads(payload)
    proto = int(hello.get("proto", -1))

    if proto < SUPPORTED_MIN or proto > SUPPORTED_MAX:
        send_error(sock, "UNSUPPORTED_VERSION", f"Server supports {SUPPORTED_MIN}-{SUPPORTED_MAX}, got {proto}")
        raise RuntimeError(f"UNSUPPORTED_VERSION: got {proto}")

    server_hello = {
        "proto": PROTO_VERSION,
        "server": "pqc_tls_vault",
        "features": [
            "framing",
            "safe_errors",
            "rate_limit_ready",
            "hybrid-x25519+kyber768",
            "cap_token_v1",
            "ed25519_reqsig_v1",
        ],
    }
    send_msg(sock, MSG_HELLO, _json_dumps(server_hello))
    return hello

def client_expect_server_hello(sock: socket.socket) -> Dict[str, Any]:
    msg_type, payload = recv_msg(sock)
    if msg_type == MSG_ERROR:
        err = recv_error(payload)
        raise RuntimeError(f"Server rejected: {err.get('code')}")
    if msg_type != MSG_HELLO:
        raise RuntimeError("Expected server MSG_HELLO reply")
    hello = _json_loads(payload)
    proto = int(hello.get("proto", -1))
    if proto < SUPPORTED_MIN or proto > SUPPORTED_MAX:
        raise RuntimeError("Server HELLO proto incompatible")
    return hello
