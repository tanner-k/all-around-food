# 0001 — Initial stack

**Status:** Accepted
**Date:** 2026-05-19

## Context
Day-one decision: pick the stack for all-around-food.

## Decision
- **Frontend:** Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend:** Python 3.12 + FastAPI + Polars (file-backed)
- **Data:** Parquet/CSV in data/ via Polars; migrate to Postgres later
- **Infra:** Vercel
- **Package manager:** pnpm
- **Node version:** 22

## Rationale
Next.js for editorial UX + Vercel frontend deploys. Python/FastAPI/Polars chosen to honor user's Python preference and defer database infra until the data shape is known. Postgres remains deferred until the migration triggers in ADR 0005 are met.

## Consequences
- (positive) Stack is familiar to the team / fits the deployment target / has good ecosystem
- (tradeoff) Locks us into the language/runtime — switching costs grow with code volume
- (followup) ADRs 0002+ will refine specific library choices within this stack

## Alternatives considered
- (briefly note what else was on the table and why it lost)
