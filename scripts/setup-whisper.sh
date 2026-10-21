#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
WHISPER_VENV="${WHISPER_VENV:-/workspace/.venv-whisper}"
python3 -m venv "$WHISPER_VENV"
"$WHISPER_VENV/bin/pip" install --cache-dir /workspace/.pip-cache -r scripts/requirements-whisper.lock
export HF_HOME="${HF_HOME:-/workspace/.cache/huggingface}"
export HF_XET_CACHE="${HF_XET_CACHE:-$HF_HOME/xet}"
"$WHISPER_VENV/bin/python" scripts/download-whisper.py
