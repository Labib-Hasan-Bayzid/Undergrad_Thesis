from kms.kms_core import bootstrap_kms

if __name__ == "__main__":
    master_hex = input("Enter MASTER_SECRET_HEX (one time only): ").strip()
    bootstrap_kms(master_hex)
    print("✅ KMS bootstrapped (KEK v1 created)")
