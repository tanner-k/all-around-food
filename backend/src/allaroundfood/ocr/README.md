# OCR Receipt Pipeline

This package is independent of any pantry receipt-import flow in the codebase. It writes to `data/receipts.parquet`, stores uploaded receipt images under `data/receipt-images/`, and emits `PriceObservation` rows via the pricing canonical matcher. It does NOT touch pantry stores or call into pantry receipt code.

## Pipeline Overview

```
receipt image/PDF
  → preprocess (pillow + pdf2image)
  → Qwen2-VL multimodal GGUF (llama-cpp-python)
  → structured Receipt + ReceiptLineItem[]
  → mapper
  → PriceObservation rows
```

## Required External Setup

Set the `QWEN_GGUF_PATH` environment variable to point to a Qwen2-VL GGUF model file on disk before running the OCR pipeline.

A convenience helper script is available:

```bash
bash scripts/download_qwen.sh [destination_path]
export QWEN_GGUF_PATH=~/.cache/allaroundfood/qwen2-vl-7b-instruct-q4_k_m.gguf
```

## Privacy

Fully offline — no network calls are made during receipt parsing. The GGUF model runs locally via `llama-cpp-python`.
