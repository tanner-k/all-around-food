# Architecture — all-around-food

## One-line
A planner-first cooking app — weekly meal planning, AI recipe import, smart shopping list, pantry inventory, and a hands-on cook mode.

## System diagram
```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   frontend   │ ───▶ │   backend    │ ───▶ │     data     │
│ Next.js 16   │      │ FastAPI      │      │   Polars     │
└──────────────┘      └──────────────┘      └──────────────┘
                              │
                              ▼
                      ┌──────────────┐
                      │    infra     │
                      │   Vercel     │
                      └──────────────┘
```

> Replace this ASCII sketch with a real diagram (Excalidraw, Mermaid, etc.) once the shape settles.

## Components

### frontend
Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui. See [`../frontend/context.md`](../frontend/context.md).

### backend
Python 3.12 + FastAPI + Polars (file-backed). See [`../backend/context.md`](../backend/context.md).

### data
Parquet/CSV in data/ via Polars; migrate to Postgres later. See [`../data/context.md`](../data/context.md).

### infra
Vercel. See [`../infra/context.md`](../infra/context.md).

## Decisions
See [`./decisions/`](./decisions/) for the running ADR log.

## Open questions
- (Track unresolved design questions here. Move to an ADR once decided.)
