# 0005 — Pricing Storage: Parquet Now, Postgres Later

**Status:** Proposed

## Context
`PriceObservation` records are high-volume and append-only: each ingestion run from multiple retailer adapters can produce thousands of rows. The rest of the application uses immutable Parquet stores (`RecipeStore`, `PantryStore`) backed by Polars, and ADR 0001 explicitly defers a Postgres migration until the data shape stabilises.

## Decision
- Start with Parquet stores following the existing immutable `XxxStore` pattern (Polars-backed, file at `data/price_observations.parquet`).
- Defer a Postgres migration until one or more migration triggers are met (see below).
- Repository interfaces (`PriceObservationRepository`, `CanonicalProductRepository`) are designed so the backing store can be swapped without changing any API or business-logic layer.

**Migration triggers — reassess when any of these fire:**
1. `data/price_observations.parquet` exceeds 1,000,000 rows, **or**
2. p95 query latency on `/prices/*` endpoints exceeds 500 ms, **or**
3. Concurrent-write contention is observed during multi-adapter ingestion runs.

## Rationale
Parquet is already the established persistence pattern in this repo. Using it for pricing avoids introducing database infrastructure, connection pooling, and migration tooling before the query patterns and data volumes are understood. The repository-interface boundary ensures the switch to Postgres is a contained, backend-only change when the triggers fire.

## Consequences
- No infrastructure cost in v1 — no database server to provision or maintain.
- Concurrent writes from parallel adapter runs must be serialised at the ingestion layer (append-then-rewrite pattern) until Postgres is introduced.
- When a migration trigger fires, a follow-up ADR must be opened to define the Postgres schema, index strategy, and migration script before any work begins.
- This ADR is **Proposed**, not Accepted — it requires explicit sign-off before the `PriceObservationStore` implementation is merged.

## Alternatives considered
- Postgres from day one: deferred; infra overhead is not justified until query patterns and volume are understood.
- SQLite: considered as a middle ground; rejected because the existing codebase has no SQLite tooling and Polars/Parquet already covers the read-heavy analytics patterns needed in Phase 4.
- DuckDB: deferred; would be a natural fit for analytical queries but adds another dependency before the schema is stable.
