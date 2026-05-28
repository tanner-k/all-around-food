# ocr/

## Scope
- Offline receipt OCR for image/PDF uploads.
- Preprocess receipts, run Qwen2-VL GGUF locally, parse structured receipts, and map line items to pricing `PriceObservation` rows.
- FastAPI routes mounted under `/receipts`.

## Not in scope
- Pantry receipt import flows or pantry inventory mutation.
- Grocery adapter scraping -> `../pricing/adapters/`.

## Data
- Parsed receipts write to `data/receipts.parquet`.
- Mapped price observations write through the pricing store at `data/pricing/price_observations.parquet`.
- The OCR pipeline depends on pricing canonical matching but should not depend on pantry modules.

## Runtime Setup
Set `QWEN_GGUF_PATH` to a local Qwen2-VL GGUF file for real OCR:

```bash
bash scripts/download_qwen.sh
export QWEN_GGUF_PATH="$HOME/.cache/allaroundfood/qwen2-vl-7b-instruct-q4_k_m.gguf"
```

Without a valid `QWEN_GGUF_PATH`, the API falls back to `FakeQwenVLClient` so the server can start, but parsing is not real OCR.

PDF inputs use `pdf2image`, which requires Poppler on the host:

```bash
brew install poppler
```

## Agent Notes
- Keep all `llama_cpp` imports inside `qwen_loader.py`.
- Use `FakeQwenVLClient` in tests unless a slow/model-backed test is explicitly requested.
- Clean up preprocessing temp directories when callers do not supply `output_dir`.
