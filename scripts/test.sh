#!/usr/bin/env bash
# Runs the automated tests. Real-dump golden tests run only if POKEMMO_DUMPS_DIR points at your dump folder.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
PY="python3"
if [ -x ".venv/bin/python" ]; then PY=".venv/bin/python"; fi
"$PY" -m pytest -q "$@"
