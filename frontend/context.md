# frontend/

## Scope
- UI components, pages, routes
- Server actions/data access against Supabase plus client-side interaction state
- Styles, assets, public files

## Not in scope
- Worker-only parsing/OCR/transcription → `backend/`
- Data models and migrations → `data/`
- Deployment / infrastructure → `infra/`

## Stack
Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui

## Local skills / conventions
- ui-ux-pro-max
- shadcn/ui MCP

## Run
```bash
cd frontend
pnpm dev
```

## Routes

### App Pages
- `/` (root index)
- `/plan` — weekly meal planner
- `/cookbook` — recipe list view
- `/cookbook/[id]` — recipe detail page (magazine-style)
- `/cookbook/[id]/cook` — immersive cook mode (step-by-step or full-scroll layout)
- `/cookbook/[id]/edit` — edit saved recipe
- `/evaluations` — eval dashboard (dev tool)
- `/import` — recipe import flow
- `/shop` — shopping list
- `/pantry` — pantry inventory

## Notes for agents
- Component files: one component per file, named in PascalCase
- Co-locate `Component.tsx` + `Component.test.tsx` + `Component.module.css`
- Server components and actions use `frontend/src/lib/db/*` Supabase helpers. Client components call server actions for mutations.
- `frontend/src/lib/api.ts` intentionally only keeps URL classification helpers used by import UI.
- Before adding a new dependency, check whether it duplicates something already in `package.json`
