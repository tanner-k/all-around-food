# 0004 — Canonical Product Matching

**Status:** Accepted
**Date:** 2026-05-24

## Context
The same physical product (e.g., a 12-oz can of Bumble Bee tuna) appears across retailers with divergent SKUs, inconsistent brand strings, and varied sizing notation (e.g., "12 oz", "12oz", "340g", "0.75 lb"). Meaningful cross-retailer price comparison requires collapsing these retailer-specific representations into a single canonical product record.

## Decision
- **Local embeddings only:** use `sentence-transformers` with the `BAAI/bge-small-en-v1.5` model (384-dimensional vectors). No OpenAI or other external embedding API dependency.
- Cosine similarity is computed against the `embedding` field of each `CanonicalProduct` record.
- `rapidfuzz` token ratio is used as a tie-breaker when cosine similarity scores are too close to distinguish confidently.
- Similarity thresholds are not hardcoded — they are tuned by running the matcher against a labeled fixture set of approximately 200 products in the test suite.

## Rationale
A local embedding model keeps the pipeline fully offline, avoids per-call API costs, and eliminates a network dependency in the ingestion hot path. `BAAI/bge-small-en-v1.5` is chosen for its balance of quality and size (384d, ~130 MB). `rapidfuzz` is a fast, zero-dependency tie-breaker that handles the common case of minor string differences (e.g., "Bumble Bee" vs "Bumble Bee®") without a second embedding call.

## Consequences
- Adds `sentence-transformers` and `torch` (CPU build) as backend dependencies.
- First invocation incurs a one-time model download (~130 MB); subsequent calls use the local cache.
- 384-dimensional vectors are stored as a `list[float]` column in the canonical products Parquet file.
- Matching precision and recall must be validated against the labeled fixture set before any threshold change is merged; the test is the contract.
- No external embedding API calls are permitted in the matching path — route any embedding request through the local `sentence-transformers` service.

## Alternatives considered
- OpenAI `text-embedding-3-small`: rejected to avoid external API cost and network dependency in the ingestion path.
- Purely fuzzy string matching (rapidfuzz only): rejected because product names alone are insufficient — unit normalization and brand aliases cause too many false positives/negatives without semantic similarity.
- Heavier local models (e.g., `all-mpnet-base-v2`, 768d): deferred; `bge-small-en-v1.5` meets accuracy needs at half the vector size and faster inference.
