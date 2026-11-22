#!/usr/bin/env bash
# Creates a self-contained virtual environment in ./.venv with PySide6 (native windows).
# Nothing is installed system-wide; delete the .venv folder to remove it.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements-native.txt
echo
echo "Done. Start the Companion with: ./run.sh"
