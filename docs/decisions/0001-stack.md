# 0001 — Initial stack

**Status:** Accepted; infra/backend portions superseded by ADR 0007
**Date:** 2026-05-19
**Superseded by:** ADR 0007 for the hosted backend, persistence, and deploy shape.

## Context
Day-one decision: pick the stack for all-around-food.

## Decision
- **Frontend:** Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend:** Python 3.12 local worker (current shape per ADR 0007)
- **Data:** Supabase Postgres + Storage for core app data; Parquet retained for deferred pricing/OCR paths
- **Infra:** Vercel PWA + Supabase + local worker
- **Package manager:** pnpm
- **Node version:** 22

## Rationale
Next.js for editorial UX + Vercel frontend deploys. Python remains the local parsing/ML runtime. ADR 0007 supersedes the original hosted HTTP backend + file-backed persistence plan.

## Consequences
- (positive) Stack is familiar to the team / fits the deployment target / has good ecosystem
- (tradeoff) Locks us into the language/runtime — switching costs grow with code volume
- (followup) ADRs 0002+ will refine specific library choices within this stack

## Alternatives considered
- (briefly note what else was on the table and why it lost)
