#!/bin/bash
# Double-click this file on a Mac to launch "Check My iPhone".
# It sets up everything the first time (a private Python environment),
# then opens the graphical scanner. No terminal knowledge required.

set -e
cd "$(dirname "$0")"

echo "Check My iPhone — first-time setup may take a minute…"

# Find a Python 3.
PY="$(command -v python3 || true)"
if [ -z "$PY" ]; then
  echo
  echo "Python 3 is not installed."
  echo "Install it from https://www.python.org/downloads/ and run this again."
  read -r -p "Press Return to close…" _
  exit 1
fi

# Create the private environment once.
if [ ! -d ".venv" ]; then
  echo "Creating a private Python environment…"
  "$PY" -m venv .venv
fi

# Install / update ioscan + the MVT engine into it (quietly).
./.venv/bin/pip install --quiet --upgrade pip >/dev/null 2>&1 || true
./.venv/bin/pip install --quiet -e ".[full]" >/dev/null

# Launch the graphical app.
echo "Launching…"
exec ./.venv/bin/ioscan-gui
