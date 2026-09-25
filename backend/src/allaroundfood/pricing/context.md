# pricing/

## Scope
- Grocery price tracking adapters, canonical product matching, and price analytics.
- Parquet-backed stores for canonical products, retailer SKUs, store locations, and price observations.
- FastAPI routes mounted under `/pricing`.

## Not in scope
- Pantry receipt import flows.
- Receipt OCR parsing -> `../ocr/`.
- Frontend comparison UI -> `frontend/`.

## Data
- Default data root comes from `PRICING_DATA_DIR` via `Settings.pricing_data_dir`; it defaults to the repo-root `data/` directory.
- Pricing files live under `data/pricing/`:
  - `canonical_products.parquet`
  - `retailer_skus.parquet`
  - `store_locations.parquet`
  - `price_observations.parquet`

## Matching
- Canonical matching uses GTIN first, then fuzzy/embedding matching.
- Default embedding model: `BAAI/bge-small-en-v1.5`.
- Use `FakeEmbeddingService` in fast tests; avoid downloading models in unit tests.

## Adapters
- Kroger is the official API-backed adapter and requires `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET`.
- Unofficial adapters are personal-use only and gated by `DISABLE_UNOFFICIAL_INGESTION`.
- Playwright is only the scraping fallback path. Install Chromium once per machine:

```bash
cd backend
uv run playwright install chromium
```

Set `PLAYWRIGHT_HEADLESS=false` only while debugging adapter behavior locally.

## Agent Notes
- Keep adapter network calls behind explicit adapter classes; stores and analytics should stay deterministic.
- Keep ingestion immutable: return updated stores and let callers persist.
- Add or update ADRs when changing storage, matching, or adapter policy.
