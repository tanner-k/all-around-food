# frontend/

## Scope
- UI components, pages, routes
- Client-side state management
- Styles, assets, public files

## Not in scope
- Business logic → `backend/`
- Data models and migrations → `data/`
- Deployment / infrastructure → `infra/`

## Stack
Next.js 15 + TypeScript + Tailwind CSS v4 + shadcn/ui

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

### API Routes
- `POST /api/import/parse` — parse screenshot/URL → structured recipe
- `POST /api/recipes` — create recipe
- `GET /api/recipes` — list recipes
- `GET /api/recipes/[id]` — get recipe details
- `PUT /api/recipes/[id]` — update recipe
- `POST /api/recipes/[id]/cooked` — mark recipe as cooked (increment times_made)
- `POST /api/evaluations` — submit recipe for grading
- `GET /api/evaluations` — list evaluations
- `GET /api/evaluations/stats` — evaluation stats

## Notes for agents
- Component files: one component per file, named in PascalCase
- Co-locate `Component.tsx` + `Component.test.tsx` + `Component.module.css`
- API calls go through a single client in `frontend/src/lib/api.ts` (do not fetch directly from components)
- Before adding a new dependency, check whether it duplicates something already in `package.json`
