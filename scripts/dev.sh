#!/usr/bin/env bash
# One-command local launcher for Synthetic Creator Studio.
# Starts the FastAPI backend (:8000) and the Next.js studio (:3000), then
# optionally seeds demo data so the UI is populated. Ctrl-C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
SEED="${SEED:-1}"   # set SEED=0 to skip demo data

echo "▶ Synthetic Creator Studio — local dev"

# --- backend ---------------------------------------------------------------
cd "$BACKEND"
if [ ! -d .venv ]; then
  echo "• creating Python venv + installing backend deps…"
  python3 -m venv .venv
  ./.venv/bin/pip install -q --upgrade pip
  ./.venv/bin/pip install -q -r requirements.txt
fi
export SCS_DATABASE_URL="sqlite:///$BACKEND/dev.db"
echo "• starting backend on http://127.0.0.1:8000 (docs at /docs)"
./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 > /tmp/scs-backend.log 2>&1 &
BACKEND_PID=$!

# --- frontend --------------------------------------------------------------
cd "$FRONTEND"
if [ ! -d node_modules ]; then
  echo "• installing frontend deps…"
  npm install --no-audit --no-fund
fi
echo "• starting frontend on http://127.0.0.1:3000"
npm run dev > /tmp/scs-frontend.log 2>&1 &
FRONTEND_PID=$!

cleanup() { echo; echo "stopping…"; kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# --- wait for health + optional seed --------------------------------------
echo -n "• waiting for backend"
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8000/healthz >/dev/null 2>&1; then break; fi
  echo -n "."; sleep 1
done
echo " ready."

if [ "$SEED" = "1" ]; then
  echo "• seeding demo data…"
  "$BACKEND/.venv/bin/python" "$ROOT/scripts/seed_demo.py" || echo "  (seed skipped/failed — UI still works)"
fi

echo
echo "✅ Open the studio:   http://localhost:3000"
echo "   API docs (Swagger): http://localhost:8000/docs"
echo "   Logs: /tmp/scs-backend.log  /tmp/scs-frontend.log"
echo "   Press Ctrl-C to stop."
wait
