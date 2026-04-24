import sys
import kms_lib

if len(sys.argv) < 2:
    print("Usage: python kek_revoke.py <kek_version> [note]")
    raise SystemExit(2)

v = int(sys.argv[1])
note = sys.argv[2] if len(sys.argv) > 2 else ""
kms_lib.kms_revoke_kek(v, actor="OPERATOR", note=note)
print("✅ Revoked kek_version =", v)
print("Unwrap will now fail with KEK_REVOKED unless you export ALLOW_REVOKED_KEK_UNWRAP=1")
