import kms_lib
newv = kms_lib.kms_rotate_kek(actor="OPERATOR")
print("✅ Rotated KEK. New active kek_version =", newv)
print("Now files uploaded from this point will be wrapped with kek_version =", newv)
