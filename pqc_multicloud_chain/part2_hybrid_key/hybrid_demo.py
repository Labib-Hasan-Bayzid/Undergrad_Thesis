import os
import oqs
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

# We use HKDF-SHA3-512 to combine both shared secrets into one strong key.
def hkdf_sha3_512(ikm: bytes, salt: bytes, info: bytes, length: int = 32) -> bytes:
    hkdf = HKDF(
        algorithm=hashes.SHA3_512(),
        length=length,
        salt=salt,
        info=info,
    )
    return hkdf.derive(ikm)

def main():
    # -------------------------
    # 1) X25519 shared secret
    # -------------------------
    a_priv = x25519.X25519PrivateKey.generate()
    b_priv = x25519.X25519PrivateKey.generate()

    a_pub = a_priv.public_key()
    b_pub = b_priv.public_key()

    ss_x25519_a = a_priv.exchange(b_pub)
    ss_x25519_b = b_priv.exchange(a_pub)
    assert ss_x25519_a == ss_x25519_b

    # -------------------------
    # 2) Kyber / ML-KEM shared secret
    # -------------------------
    kem_name = "ML-KEM-768"  # if not available, try "Kyber768"
    enabled = oqs.get_enabled_kem_mechanisms()
    if kem_name not in enabled:
        # fallback
        if "Kyber768" in enabled:
            kem_name = "Kyber768"
        else:
            raise RuntimeError(f"Neither ML-KEM-768 nor Kyber768 found. Enabled: {enabled}")

    with oqs.KeyEncapsulation(kem_name) as kem_server:
        server_pub = kem_server.generate_keypair()

        with oqs.KeyEncapsulation(kem_name) as kem_client:
            ct, ss_kyber_client = kem_client.encap_secret(server_pub)

        ss_kyber_server = kem_server.decap_secret(ct)
        assert ss_kyber_client == ss_kyber_server

    # -------------------------
    # 3) Combine into hybrid secret
    # -------------------------
    salt = os.urandom(32)  # store salt in metadata if you need reproducibility
    ikm = ss_x25519_a + ss_kyber_client
    hybrid_secret = hkdf_sha3_512(ikm=ikm, salt=salt, info=b"hybrid-x25519+kyber")

    print("X25519 ss len:", len(ss_x25519_a))
    print("Kyber/ML-KEM ss len:", len(ss_kyber_client))
    print("Hybrid secret (32 bytes):", hybrid_secret.hex())

if __name__ == "__main__":
    main()
