#!/usr/bin/env bash
# SessionStart setup: prepare the backend so tests/linters can run in web sessions.
set -euo pipefail

cd "$(dirname "$0")/../../backend"

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

python -m pip install --quiet --upgrade pip
# Core runtime + test deps (subset of requirements.txt that runs without GPU/Postgres).
python -m pip install --quiet \
  fastapi "pydantic>=2.6" pydantic-settings "SQLAlchemy>=2.0" alembic Pillow pytest httpx

echo "Backend environment ready. Run: cd backend && source .venv/bin/activate && pytest"
