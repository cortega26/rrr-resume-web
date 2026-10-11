#!/usr/bin/env bash
#
# Regenerate the TypeScript contract from the private backend's OpenAPI schema.
#
# The backend is the source of truth: the schema is dumped straight from its
# FastAPI app (no server needed) and committed as a reviewable snapshot, then
# openapi-typescript renders src/lib/api-generated.ts from it.
# Never hand-edit api-generated.ts; fix the backend contract instead.
#
#   npm run generate:types
#
# Env overrides: RRR_BACKEND_DIR, PYTHON_BIN.

set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${RRR_BACKEND_DIR:-$HOME/VS_Code_Projects/pipelines/remote-role-radar}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SNAPSHOT="$FRONTEND_DIR/openapi/resume-qa-v1.open.json"
OUT="$FRONTEND_DIR/src/lib/api-generated.ts"

log() {
  printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "${*:2}"
}
die() { log ERROR "$@"; exit 1; }

[[ -d "$BACKEND_DIR/src/remote_role_radar" ]] \
  || die "backend not found at $BACKEND_DIR (override with RRR_BACKEND_DIR)"
command -v "$PYTHON_BIN" >/dev/null \
  || die "python not found: $PYTHON_BIN (override with PYTHON_BIN)"
[[ -f "$BACKEND_DIR/src/remote_role_radar/serve.py" ]] \
  || die "no serve module in $BACKEND_DIR; checkout predates the loopback facade (update it or set RRR_BACKEND_DIR to a checkout of origin/main)"
PYTHONPATH="$BACKEND_DIR/src" "$PYTHON_BIN" -c \
  "from remote_role_radar.serve import build_app" 2>/dev/null \
  || die "backend imports fail; install its deps first (pip install fastapi uvicorn, or pip install -e \"$BACKEND_DIR\")"
command -v npx >/dev/null || die "npx not found in PATH"
[[ -x "$FRONTEND_DIR/node_modules/.bin/openapi-typescript" ]] \
  || die "openapi-typescript is not installed; run: npm install"

log INFO "dumping schema from $BACKEND_DIR"
PYTHONPATH="$BACKEND_DIR/src" "$PYTHON_BIN" -c \
  'import json; from remote_role_radar.serve import build_app; print(json.dumps(build_app().openapi(), indent=2, sort_keys=True))' \
  >"$SNAPSHOT.tmp"
mv "$SNAPSHOT.tmp" "$SNAPSHOT"
grep -q '"ReviewResult"' "$SNAPSHOT" \
  || die "snapshot $SNAPSHOT has no ReviewResult schema; backend contract changed shape?"
API_VERSION="$("$PYTHON_BIN" -c "import json; print(json.load(open('$SNAPSHOT'))['info']['version'])")"
log INFO "snapshot $SNAPSHOT (backend contract $API_VERSION)"

log INFO "rendering $OUT"
# --default-non-nullable false: backend-optional (Pydantic fills defaults)
# must stay TS-optional; otherwise every new defaulted backend field would
# force UI updates for no reason.
npx --no-install openapi-typescript "$SNAPSHOT" -o "$OUT" --default-non-nullable false
grep -q 'ReviewResult' "$OUT" \
  || die "generated $OUT has no ReviewResult type; generator output changed?"
log INFO "done: $OUT regenerated from backend contract $API_VERSION"
