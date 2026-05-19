# 0001 — Initial stack

**Status:** Accepted
**Date:** 2026-05-19

## Context
Day-one decision: pick the stack for all-around-food.

## Decision
- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend:** Python 3.12 + Polars (file-backed; FastAPI planned)
- **Data:** Parquet/CSV in data/ via Polars; migrate to Postgres later
- **Infra:** Vercel
- **Package manager:** pnpm
- **Node version:** 22

## Rationale
Next.js for editorial UX + Vercel single-deploy. Python/Polars chosen to honor user's Python preference and defer database infra until the data shape is known — will migrate to FastAPI + Postgres in Phase B.

## Consequences
- (positive) Stack is familiar to the team / fits the deployment target / has good ecosystem
- (tradeoff) Locks us into the language/runtime — switching costs grow with code volume
- (followup) ADRs 0002+ will refine specific library choices within this stack

## Alternatives considered
- (briefly note what else was on the table and why it lost)
