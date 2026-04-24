from kms.kms_keys import wrap_dek, unwrap_dek
import os

if __name__ == "__main__":
    dek = os.urandom(32)

    wrapped, nonce, version = wrap_dek(dek, actor="test_user")
    dek2 = unwrap_dek(wrapped, nonce, version, actor="test_user")

    print("kek_version:", version)
    print("DEK match:", dek == dek2)
