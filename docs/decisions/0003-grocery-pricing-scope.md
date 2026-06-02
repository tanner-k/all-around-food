# 0003 — Grocery Pricing Scope: Personal Use Only

**Status:** Accepted
**Date:** 2026-05-24

## Context
We are adding multi-retailer grocery price tracking. Kroger exposes an official OAuth2 API. Walmart, Costco, Whole Foods, and Instacart do not offer developer APIs — their adapters rely on unofficial scraping techniques. Operating scrapers against live retailer sites creates ToS exposure that must be bounded.

## Decision
- **Personal use only.** This system must not be deployed to any public host without first revisiting this ADR.
- **Kroger:** uses the official Kroger Developer API exclusively.
- **Walmart, Costco, Whole Foods, Instacart:** unofficial adapters are authorized for personal use by the repo owner only.
- All unofficial adapters are gated behind the `DISABLE_UNOFFICIAL_INGESTION` environment variable (default `false` — adapters enabled). Setting it to `true` disables all unofficial adapters and raises an error if one is invoked.
- **No proxies in v1.** Requests are made directly from the host running the application.
- **No third-party scraping services.** Apify, ScrapingBee, and similar services are explicitly excluded from v1.

## Rationale
Restricting to personal use limits the blast radius of any ToS dispute to the repo owner. Gating unofficial adapters behind a single env var makes it trivial to disable them when deploying to a shared or public environment. Deferring proxies and paid scraping services keeps the initial implementation simple and dependency-free.

## Consequences
- The system must never be deployed to a public host without re-evaluating this ADR and obtaining appropriate authorizations or switching to official data sources.
- Each unofficial retailer adapter must import a shared `unofficial_only` guard that checks `DISABLE_UNOFFICIAL_INGESTION` and raises an error when it is set to `true`.
- The repo owner accepts personal responsibility for retailer ToS exposure arising from unofficial adapter usage.
- A follow-up ADR is required before adding proxy support or a third-party scraping service.

## Alternatives considered
- Use a paid scraping service (Apify, ScrapingBee): rejected for v1 to avoid external cost and dependency; deferred pending scale needs.
- Restrict all adapters to official APIs only: rejected because official APIs do not exist for Walmart, Costco, Whole Foods, and Instacart, which would eliminate most price-comparison value.
- Deploy with scrapers enabled on a public host: rejected; ToS risk is not acceptable for a shared deployment without explicit re-evaluation.
