# Implementation Plan: Location-Aware Grocery Price Tracking & Comparative Analytics

## Scope: Personal Use

This system is built for **personal, single-tenant use only**. It is not intended for public deployment or redistribution. Unofficial-API and scraping-based adapters are gated by `DISABLE_UNOFFICIAL_INGESTION` (defaults to enabled / adapters available), and all retailer ToS exposure is the operator's responsibility. ADR 0003 formalizes this posture. Do not push this stack to a public Vercel/EC2 deploy without re-evaluating legal scope.

## Overview

Add a `pricing/` backend package that tracks per-ZIP grocery prices across Kroger (official API), Walmart, Costco, Whole Foods (via Amazon), and Instacart, plus an independent OCR receipt pipeline. Canonicalize products with local embeddings and surface comparative analytics in a new `/prices` frontend route. Storage stays on Parquet for v1; Postgres migration is deferred and trigger-gated.

## Locked Decisions

1. **Personal use only.** Kill-switch env `DISABLE_UNOFFICIAL_INGESTION` (default: adapters enabled, documented as personal-use). Codified in ADR 0003.
2. **Local embeddings only.** `sentence-transformers` with `BAAI/bge-small-en-v1.5` (384-dim). No OpenAI dependency. ADR 0002 updated.
3. **Scraping = local Playwright only.** Fallback chain per retailer: reverse-engineered JSON → local Playwright + `playwright-stealth` → OCR. No Apify, no ScrapingBee.
4. **Parquet now, Postgres deferred.** ADR 0005 stays `Proposed`. Migration trigger: >1M `PriceObservation` rows OR p95 query >500ms. No Phase-6 Postgres work scheduled.
5. **OCR pipeline coexists with `pantry/receipt-import`.** New `ocr/` package writes to `data/receipts.parquet` + `PriceObservation` rows. Existing pantry flow is untouched. Future unification ADR TBD.

Carry-forward decisions:
- Qwen GGUF path via `QWEN_GGUF_PATH` env; `scripts/download_qwen.sh` helper; weights not committed.
- No proxies in v1 — low request rates.
- Single-tenant. No `user_id` columns yet, but Pydantic models include a `# forward-compat: user_id` note.
- Frontend charts: `recharts`.
- ZIP handling: generic resolver; no hardcoded ZIPs outside `tests/fixtures/`.
- Uber Eats: stretch goal, not in Phase 2.

## Requirements

- Per-ZIP price observation ingestion for Kroger, Walmart, Costco, Whole Foods (Amazon), Instacart.
- Canonical product graph keyed by `(brand, name, size, unit)` + 384-d local embedding similarity.
- OCR receipt parser using Qwen2-VL GGUF (local), independent of the existing pantry receipt importer.
- Comparative analytics API (price-per-unit, retailer ranking, history) and `/prices` UI.
- Strict separation of "official API" vs "unofficial" adapters; latter gated by kill-switch env.
- Parquet-backed storage; clean repository interfaces to allow future Postgres swap.

## Architecture Changes

- New backend package: `backend/src/allaroundfood/pricing/` with submodules `adapters/`, `canonical/`, `analytics/`, `store/`, `models.py`.
- New backend package: `backend/src/allaroundfood/ocr/` (Qwen2-VL receipt parser), independent of any existing pantry receipt-import flow.
- New data files: `data/price_observations.parquet`, `data/canonical_products.parquet`, `data/store_locations.parquet`, `data/receipts.parquet`.
- New FastAPI routes added to `backend/src/allaroundfood/api.py` (or a new `backend/src/allaroundfood/pricing/api.py` module imported by `api.py`): `/prices/search`, `/prices/compare`, `/prices/history`, `/receipts/parse`.
- New frontend route: `frontend/app/prices/` with `PriceCompareTable`, `PriceHistoryChart` (recharts), `ZipSelector`.
- New ADRs: `0003-grocery-pricing-scope.md` (personal-use posture), `0004-canonical-product-matching.md` (local embeddings), `0005-pricing-storage.md` (Parquet → Postgres trigger, status Proposed).
- Update `CLAUDE.md` / `AGENTS.md` Project Map to include `pricing/` and `ocr/`.

## Per-Retailer Adapter Matrix

| Retailer       | Primary path                              | Fallback 1                        | Fallback 2 | Kill-switch gated | Notes |
|----------------|-------------------------------------------|-----------------------------------|------------|-------------------|-------|
| Kroger         | Official Kroger Products API (OAuth)      | —                                 | OCR        | No (official)     | Per-store `locationId` required. |
| Walmart        | Reverse-engineered storefront JSON        | Local Playwright + stealth        | OCR        | Yes               | ZIP → store via `/store/finder`. |
| Costco         | Reverse-engineered warehouse JSON         | Local Playwright + stealth        | OCR        | Yes               | Membership-gated SKUs flagged. |
| Whole Foods    | Amazon Fresh / WF storefront JSON         | Local Playwright + stealth        | OCR        | Yes               | Amazon-account session reuse. |
| Instacart      | Reverse-engineered retailer-storefront JSON | Local Playwright + stealth     | OCR        | Yes               | Multi-retailer; tag source store. |
| Uber Eats      | Stretch — not in Phase 2                  | —                                 | —          | Yes               | Deferred. |

## Dependency List

Python (add to `pyproject.toml`):
- `httpx>=0.27` (async HTTP)
- `tenacity>=9.0` (retries/backoff)
- `pydantic>=2.9`
- `polars>=1.12`
- `sentence-transformers>=3.3`
- `torch>=2.5` (CPU build acceptable)
- `playwright>=1.48`
- `playwright-stealth>=1.0.6`
- `llama-cpp-python>=0.3` (Qwen2-VL GGUF inference)
- `pillow>=11.0`, `pdf2image>=1.17` (receipt preprocessing)
- `rapidfuzz>=3.10` (string match fallback)
- `pyzipcode>=3.0` or local ZIP-centroid table (generic resolver)

Removed / not adopted: `openai`, `apify-client`, `scrapingbee`.

Frontend (add via pnpm):
- `recharts@^2.13`

System: Playwright browser install via `playwright install chromium` (post-install script).

## Environment Variables

| Var                            | Required | Default | Purpose |
|--------------------------------|----------|---------|---------|
| `KROGER_CLIENT_ID`             | Yes (Kroger) | —    | Kroger OAuth client. |
| `KROGER_CLIENT_SECRET`         | Yes (Kroger) | —    | Kroger OAuth secret. |
| `DISABLE_UNOFFICIAL_INGESTION` | No       | `false` | When `true`, all non-Kroger adapters refuse to run. |
| `QWEN_GGUF_PATH`               | Yes (OCR) | —      | Absolute path to Qwen2-VL GGUF weights. |
| `PRICING_DATA_DIR`             | No       | `data/` | Override Parquet root. |
| `EMBEDDING_MODEL_NAME`         | No       | `BAAI/bge-small-en-v1.5` | Override embedding model. |
| `PLAYWRIGHT_HEADLESS`          | No       | `true`  | Toggle for local debugging. |

Removed: `SCRAPINGBEE_API_KEY`, `APIFY_TOKEN`, `OPENAI_API_KEY` (for embeddings).

## Implementation Steps

### Phase 0 — Foundations & ADRs
1. **Write ADR 0003** (`docs/decisions/0003-grocery-pricing-scope.md`)
   - Action: Document personal-use posture, kill-switch env, retailer ToS acknowledgment.
   - Risk: Low.
2. **Write ADR 0004** (`docs/decisions/0004-canonical-product-matching.md`)
   - Action: Lock local `bge-small-en-v1.5` embeddings + `rapidfuzz` fallback. State 384-dim persistence.
   - Risk: Low.
3. **Write ADR 0005 (Proposed)** (`docs/decisions/0005-pricing-storage.md`)
   - Action: Parquet now; Postgres trigger = >1M rows or p95 > 500ms.
   - Risk: Low.
4. **Update Project Map** (`CLAUDE.md`, `AGENTS.md`)
   - Action: Add `backend/src/allaroundfood/pricing/`, `backend/src/allaroundfood/ocr/`, new ADRs.
   - Risk: Low — must update both files in same commit.

### Phase 1 — Core models, store, Kroger adapter
5. **Pydantic models** (`backend/src/allaroundfood/pricing/models.py`)
   - `PriceObservation`, `CanonicalProduct`, `StoreLocation`, `RetailerSKU`. Add `# forward-compat: user_id` comments. Frozen models (immutable).
6. **Parquet repositories** (`backend/src/allaroundfood/pricing/store/`)
   - `price_observation_store.py`, `canonical_product_store.py` (persists 384-d vectors as list[float]), `store_location_store.py`. Repository interface + Parquet impl.
7. **ZIP → store resolver** (`backend/src/allaroundfood/pricing/locations/resolver.py`)
   - Generic ZIP centroid lookup; no hardcoded ZIPs outside `tests/fixtures/`.
8. **Kroger adapter** (`backend/src/allaroundfood/pricing/adapters/kroger.py`)
   - OAuth client-credentials, `/locations`, `/products` per `locationId`. Async via `httpx`. Tenacity retries.
9. **Tests (RED → GREEN)**
   - Unit: model validation, parquet roundtrip, ZIP resolver.
   - Integration: Kroger adapter against recorded fixtures (VCR-style JSON in `tests/fixtures/kroger/`).

### Phase 2 — Unofficial adapters (kill-switch gated)
10. **Kill-switch guard** (`backend/src/allaroundfood/pricing/adapters/_guard.py`)
    - Decorator that raises if `DISABLE_UNOFFICIAL_INGESTION=true`.
11. **Walmart adapter** (`backend/src/allaroundfood/pricing/adapters/walmart.py`) — JSON-first, Playwright fallback.
12. **Costco adapter** (`backend/src/allaroundfood/pricing/adapters/costco.py`) — JSON-first, Playwright fallback. Flag membership SKUs.
13. **Whole Foods adapter** (`backend/src/allaroundfood/pricing/adapters/whole_foods.py`) — Amazon storefront JSON, Playwright fallback.
14. **Instacart adapter** (`backend/src/allaroundfood/pricing/adapters/instacart.py`) — per-retailer storefront, tag source store.
15. **Playwright runner** (`backend/src/allaroundfood/pricing/adapters/_playwright.py`)
    - Shared headless launcher + `playwright-stealth`. Bounded concurrency.
16. **Tests** — each adapter against fixture HTML/JSON; guard test confirms env disables all unofficial adapters.

### Phase 3 — Canonical product matching
17. **Embedding service** (`backend/src/allaroundfood/pricing/canonical/embeddings.py`)
    - Lazy-load `sentence-transformers` `BAAI/bge-small-en-v1.5`; CPU; normalize.
18. **Matcher** (`backend/src/allaroundfood/pricing/canonical/matcher.py`)
    - Cosine similarity against `CanonicalProductStore` 384-d vectors. `rapidfuzz` exact-token tie-breaker. Threshold tuned in tests.
19. **Ingestion pipeline** (`backend/src/allaroundfood/pricing/ingestion.py`)
    - For each adapter result: resolve/insert canonical → write `PriceObservation`.
20. **Tests** — matcher precision/recall on a labeled fixture set of ~200 product names.

### Phase 4 — Analytics & API
21. **Analytics module** (`backend/src/allaroundfood/pricing/analytics/`)
    - `price_per_unit.py`, `retailer_ranking.py`, `history.py`. Pure Polars; no I/O.
22. **FastAPI routes** (`backend/src/allaroundfood/pricing/api/`)
    - `GET /prices/search?q=&zip=`, `GET /prices/compare?canonical_id=&zip=`, `GET /prices/history?canonical_id=&zip=&days=`.
    - Pydantic response envelopes per repo `patterns.md`.
23. **Tests** — analytics unit tests + FastAPI integration tests with seeded Parquet.

### Phase 5 — OCR receipt pipeline (independent of pantry/receipt-import)
24. **OCR package boundary doc** (`backend/src/allaroundfood/ocr/README.md`)
    - State explicitly: independent of `backend/pantry/receipt_import/`. Writes only to `data/receipts.parquet` + `PriceObservation`.
25. **Qwen2-VL loader** (`backend/src/allaroundfood/ocr/qwen_loader.py`)
    - `llama-cpp-python` w/ `QWEN_GGUF_PATH`. Helper `scripts/download_qwen.sh`. Weights gitignored.
26. **Receipt preprocessor** (`backend/src/allaroundfood/ocr/preprocess.py`) — `pillow` + `pdf2image`.
27. **Parser** (`backend/src/allaroundfood/ocr/parser.py`) — prompt → structured `ReceiptLineItem` list.
28. **Mapper** (`backend/src/allaroundfood/ocr/to_observations.py`) — line items → canonical → `PriceObservation`.
29. **API route** (`backend/src/allaroundfood/pricing/api/receipts.py`) — `POST /receipts/parse`.
30. **Tests** — fixtures `tests/fixtures/receipts/*.jpg|.pdf` with expected JSON; parser snapshot tests.

### Phase 6 — Frontend `/prices`
31. **Install recharts** (`frontend/package.json`).
32. **Route** (`frontend/app/prices/page.tsx`) — search + ZIP selector.
33. **Components** (`frontend/app/prices/_components/`)
    - `ZipSelector.tsx`, `PriceCompareTable.tsx`, `PriceHistoryChart.tsx` (recharts).
34. **API client** (`frontend/lib/pricing-client.ts`).
35. **Tests** — Vitest + React Testing Library; Playwright e2e for compare flow.

### Phase 7 — Hardening
36. **Rate limiting & backoff audit** across adapters.
37. **Observability** — structured logs per adapter; counters for fallback usage.
38. **README updates** — `backend/src/allaroundfood/pricing/context.md`, `backend/src/allaroundfood/ocr/context.md`, top-level setup notes for `QWEN_GGUF_PATH` and `playwright install`.

(No Postgres migration work scheduled. Re-evaluate per ADR 0005 trigger.)

## Testing Strategy

- **Unit (80%+):** models, parquet stores, ZIP resolver, matcher, analytics, OCR parser.
- **Integration:** each adapter against recorded fixtures; FastAPI route tests with seeded Parquet.
- **E2E:** Playwright on `/prices` happy path (search → compare → history).
- **Fixtures:** all HTML/JSON/receipt fixtures under `tests/fixtures/` (no live network in CI).
- **CI guard:** test that `DISABLE_UNOFFICIAL_INGESTION=true` short-circuits all non-Kroger adapters.

## Risks & Mitigations

- **Risk:** Storefront DOM/JSON drift for Walmart/Costco/WF/Instacart.
  - Mitigation: Versioned fixtures, snapshot tests, fallback chain (JSON → Playwright → OCR).
- **Risk:** Retailer ToS exposure.
  - Mitigation: Personal-use scope (ADR 0003), kill-switch env, no public deploy, low request rates, no proxies.
- **Risk:** Canonical product mismatches across retailers (same item, different naming).
  - Mitigation: 384-d embeddings + rapidfuzz tie-breaker; labeled fixture set + precision/recall test.
- **Risk:** Qwen2-VL GGUF latency on CPU.
  - Mitigation: Async job, cache by receipt hash, document model size/perf in `ocr/README.md`.
- **Risk:** Parquet scaling.
  - Mitigation: ADR 0005 trigger (>1M rows or p95 >500ms); repository interface allows Postgres swap without API changes.
- **Risk:** Playwright fragility in headless mode.
  - Mitigation: `playwright-stealth`, bounded concurrency, fall through to OCR.
- **Risk:** OCR pipeline drifting into pantry/receipt-import territory.
  - Mitigation: Boundary doc in `backend/src/allaroundfood/ocr/README.md`; OCR never writes to pantry stores.

## Success Criteria

- [ ] ADRs 0003, 0004, 0005 merged; CLAUDE.md + AGENTS.md updated together.
- [ ] Kroger adapter pulls per-ZIP prices using official API with OAuth.
- [ ] All four unofficial adapters operational behind kill-switch, with JSON-first + Playwright fallback.
- [ ] `DISABLE_UNOFFICIAL_INGESTION=true` blocks every non-Kroger adapter (test-enforced).
- [ ] Canonical matcher uses local `bge-small-en-v1.5` 384-d embeddings; no `openai` dependency in `pyproject.toml`.
- [ ] `data/price_observations.parquet`, `data/canonical_products.parquet`, `data/receipts.parquet` populated end-to-end.
- [ ] `/prices` route shows compare table and recharts history for a given ZIP.
- [ ] OCR pipeline parses fixture receipts to `PriceObservation` rows without touching `backend/pantry/receipt_import/`.
- [ ] `uv run ruff check && uv run mypy && uv run pytest` green; coverage ≥80% across `backend/src/allaroundfood/pricing/` and `backend/src/allaroundfood/ocr/`.
- [ ] `pnpm lint && pnpm build` green.
- [ ] No `apify-client`, `scrapingbee`, `openai`, or hardcoded ZIPs outside `tests/fixtures/`.
