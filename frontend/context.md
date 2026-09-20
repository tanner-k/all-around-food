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
- `/import` — recipe import flow
- `/shop` — redirects to local shopping list at `/app#/shop`
- `/pantry` — redirects to local pantry inventory at `/app#/pantry`
- `/prices` — grocery price comparison (gate before release unless pricing data is seeded)

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
- `GET|POST /api/pantry` — list / add pantry items
- `PUT|DELETE /api/pantry/[id]` — update / delete a pantry item
- `PATCH /api/pantry/[id]/status` — set a pantry item's stock status
- `POST /api/pantry/receipt` — parse a receipt photo via Claude vision (review step)
- `POST /api/pantry/receipt-import` — bulk-add confirmed receipt items to the pantry
- `GET /api/shopping-list` — shopping list grouped by aisle
- `POST /api/shopping-list/items` — add a manual shopping-list item
- `PUT|DELETE /api/shopping-list/items/[id]` — update / delete a shopping-list item
- `PATCH /api/shopping-list/items/[id]/check` — toggle an item's checked state
- `POST /api/shopping-list/generate` — generate list items from recipe IDs
- `DELETE /api/shopping-list/checked` — remove all checked items
- `POST /api/shopping-list/text` — text unchecked items to a phone number via Apple Messages (macOS-only)
- `GET|PUT /api/meal-plans/[weekOf]` — get / replace the weekly meal plan

Most `/api/*` routes are thin proxies to the FastAPI backend via `lib/backend-proxy.ts`; `/api/pantry/receipt` calls Claude directly (like `/api/import/parse`).

## Notes for agents
- The installed app enters through `/app`. Cookbook, edit, cook, and settings read IndexedDB through `lib/local/repository.ts`; shell views subscribe to local changes. Legacy cookbook, plan, shop, and pantry URLs redirect to matching local hash routes. The local plan, shop, and pantry views commit through IndexedDB transactions; shopping generation replaces only the selected week.
- Offline screen components use local repository callbacks. Keep server actions, backend API wrappers, and private configuration outside the `/app` client import tree. `/`, `/app`, `/assets`, and legacy local redirect routes bypass auth middleware; online export and auth remain protected.
- Component files: one component per file, named in PascalCase
- Co-locate `Component.tsx` + `Component.test.tsx` + `Component.module.css`
- Legacy online client components call the backend through `frontend/src/lib/api.ts` (typed wrapper over the `/api/*` proxy routes); local `/app` components use `lib/local/repository.ts`; server components may `fetch` the backend directly with `cache: "no-store"` (see `cookbook/page.tsx`, `pantry/page.tsx`, `shop/page.tsx`)
- Before adding a new dependency, check whether it duplicates something already in `package.json`
