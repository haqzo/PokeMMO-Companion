#!/usr/bin/env bash
# PokeMMO Companion launcher (Linux). Uses ./.venv if present, otherwise system python3.
#   ./run.sh                native windows (needs PySide6 + QtWebEngine), falls back to browser mode
#   ./run.sh --browser      run in your web browser
#   ./run.sh --spike        native window feasibility test (writes spike-report.json)
#   ./run.sh --xwayland     force XWayland (pin/positioning on KDE Wayland)
#   ./run.sh --help         all options
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
PY="python3"
if [ -x ".venv/bin/python" ]; then PY=".venv/bin/python"; fi
exec "$PY" -m companion "$@"
