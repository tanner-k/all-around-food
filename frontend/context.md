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
- `/app` — offline local app shell; hash routes `#/plan`, `#/cookbook`, `#/cookbook/new`, `#/cookbook/[id]`, `#/cookbook/[id]/edit`, `#/cookbook/[id]/cook`, `#/shop`, `#/pantry`, `#/import`, `#/settings`
- `/plan` — redirects to local weekly meal planner at `/app#/plan`
- `/cookbook` — recipe list view
- `/cookbook/[id]` — recipe detail page (magazine-style)
- `/cookbook/[id]/cook` — immersive cook mode (step-by-step or full-scroll layout)
- `/cookbook/[id]/edit` — edit saved recipe
- `/evaluations` — eval dashboard (dev tool)
- `/import` — redirects to the local import queue at `/app#/import`
- `/shop` — redirects to local shopping list at `/app#/shop`
- `/pantry` — redirects to local pantry inventory at `/app#/pantry`
- `/prices` — legacy pricing comparison page, hidden from the personal `/app` navigation

### API Routes
- `POST /api/import/parse` and `POST /api/pantry/receipt` — retired direct frontend parsers; both return 410
- `GET /api/export` — authenticated owner-only one-time cloud library export
- `/api/pricing/*` — legacy FastAPI pricing proxies, kept for the separate opt-in pricing suite; the personal app does not call them

The evaluation dashboard uses the owner-scoped Supabase `evaluation_stats` view. Old recipe, meal-plan, pantry, shopping-list, and evaluation proxy routes have been removed; the personal `/app` reads and writes IndexedDB directly.

## Notes for agents
- The installed app enters through `/app`. Cookbook, edit, cook, and settings read IndexedDB through `lib/local/repository.ts`; shell views subscribe to local changes. Legacy cookbook, plan, shop, and pantry URLs redirect to matching local hash routes. The local plan, shop, and pantry views commit through IndexedDB transactions; shopping generation replaces only the selected week.
- Offline screen components use local repository callbacks. Keep server actions, backend API wrappers, and private configuration outside the `/app` client import tree. `/`, `/app`, `/assets`, and legacy local redirect routes (including `/import`) bypass auth middleware; online export and API routes remain protected.
- The production service worker precaches `/app` and emitted assets, not API/auth/Supabase responses. `pnpm build` generates the asset manifest; `pnpm test:pwa` needs that build and Chromium. The app's data stays with one browser profile and origin; Settings supports versioned JSON backup and restore.
- Component files: one component per file, named in PascalCase
- Co-locate `Component.tsx` + `Component.test.tsx` + `Component.module.css`
- Local `/app` components use `lib/local/repository.ts`. The hidden legacy `/prices` page uses `lib/pricing-client.ts` and the retained pricing proxies. Do not add FastAPI or Supabase calls to ordinary local screens.
- Before adding a new dependency, check whether it duplicates something already in `package.json`
