# Architecture — all-around-food

## One-line
A planner-first cooking app — weekly meal planning, AI recipe import, smart shopping list, pantry inventory, and a hands-on cook mode.

## System diagram
```
┌──────────────┐        ┌──────────────┐
│   frontend   │ ─────▶ │   Supabase   │
│ Next.js 16   │        │ Postgres/RLS │
└──────────────┘        └──────────────┘
       │                       ▲
       │ enqueue parse_jobs    │ service-role writes
       ▼                       │
┌──────────────┐               │
│ local worker │ ──────────────┘
│ Python 3.12  │
└──────────────┘
```

> Replace this ASCII sketch with a real diagram (Excalidraw, Mermaid, etc.) once the shape settles.

## Components

### frontend
Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui. Server components read/write Supabase under RLS. See [`../frontend/context.md`](../frontend/context.md).

### backend
Python 3.12 worker for queued recipe imports, video transcription, OCR, evals, and retained pricing libraries. See [`../backend/context.md`](../backend/context.md).

### data
Supabase migrations plus archived Parquet seed/migration inputs. Pricing/OCR Parquet paths remain local until a future pricing migration. See [`../data/context.md`](../data/context.md).

### infra
Vercel for the PWA, Supabase for auth/database/storage, and a local worker process for parsing jobs. See [`../infra/context.md`](../infra/context.md).

## Decisions
See [`./decisions/`](./decisions/) for the running ADR log.

## Open questions
- (Track unresolved design questions here. Move to an ADR once decided.)
