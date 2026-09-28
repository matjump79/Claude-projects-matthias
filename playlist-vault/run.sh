#!/usr/bin/env bash
# Start Playlist Vault. First run creates a private Python environment in .venv.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install --quiet -r requirements.txt
fi
set -a; [ -f .env ] && . ./.env; set +a
exec .venv/bin/uvicorn app.main:create_app --factory --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
