#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BG_VENV="${BG_VENV:-/workspace/.venv-bg}"
python3 -m venv "$BG_VENV"
"$BG_VENV/bin/python" -m pip install --cache-dir /workspace/.pip-cache -r scripts/requirements-bg.lock
export BG_MODEL_DIR="${BG_MODEL_DIR:-/workspace/.cache/taledit/rembg}"
"$BG_VENV/bin/python" scripts/download-bg-model.py
