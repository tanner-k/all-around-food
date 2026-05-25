#!/usr/bin/env bash
# download_qwen.sh — Download Qwen2-VL-7B-Instruct Q4_K_M GGUF for the OCR pipeline.
#
# Usage:
#   bash scripts/download_qwen.sh [destination_path]
#
# If destination_path is omitted, the file is saved to:
#   ~/.cache/allaroundfood/qwen2-vl-7b-instruct-q4_k_m.gguf
#
# After downloading, set:
#   export QWEN_GGUF_PATH=<destination_path>
#
# Model source: https://huggingface.co/unsloth/Qwen2-VL-7B-Instruct-GGUF
# Recommended quantization: Q4_K_M (good balance of quality and speed)

set -euo pipefail

DEST="${1:-${HOME}/.cache/allaroundfood/qwen2-vl-7b-instruct-q4_k_m.gguf}"
DEST_DIR="$(dirname "${DEST}")"

HF_REPO="unsloth/Qwen2-VL-7B-Instruct-GGUF"
HF_FILE="Qwen2-VL-7B-Instruct-Q4_K_M.gguf"
HF_URL="https://huggingface.co/${HF_REPO}/resolve/main/${HF_FILE}"

echo "==> Qwen2-VL-7B-Instruct Q4_K_M GGUF Downloader"
echo "    Repo  : ${HF_REPO}"
echo "    File  : ${HF_FILE}"
echo "    Dest  : ${DEST}"
echo ""

mkdir -p "${DEST_DIR}"

if [ -f "${DEST}" ]; then
    echo "==> File already exists at ${DEST}. Skipping download."
else
    echo "==> Downloading ~4.5 GB — this may take a while..."
    if command -v curl &>/dev/null; then
        curl -L --progress-bar -o "${DEST}" "${HF_URL}"
    elif command -v wget &>/dev/null; then
        wget -L -O "${DEST}" "${HF_URL}"
    else
        echo "ERROR: Neither curl nor wget found. Install one and retry." >&2
        exit 1
    fi
    echo "==> Download complete."
fi

echo ""
echo "==> To use the model, run:"
echo "    export QWEN_GGUF_PATH=\"${DEST}\""
