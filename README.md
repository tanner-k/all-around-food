# all-around-food

A personal cooking app for planning meals, saving recipes, shopping, tracking pantry stock, and cooking step by step. The `/app` experience stores its everyday library in this browser's IndexedDB and is designed to reopen offline after its PWA shell is ready. Online imports use a private Supabase queue and a separate Mac Mini worker. [ADR 0008](docs/decisions/0008-local-first-pwa.md) is still proposed; this release has not passed its hosted migration and physical-device gates.

## Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4, pnpm 10, Node 22
- Local library: IndexedDB through `idb`, with JSON backup and restore
- Online import: Supabase Auth/queue/temporary storage and a Python 3.12 Mac worker using Anthropic, yt-dlp, FFmpeg, and whisper.cpp where needed
- Legacy/backend utilities: FastAPI, Polars/Parquet, pricing, evaluations, and receipt OCR remain in the repository; they are outside the personal offline loop

## Run locally

Install dependencies, then start the frontend:

```sh
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend dev
```

Open `http://localhost:3000/app` for UI development. Add a recipe manually, plan a week, generate shopping, and update pantry without Supabase or a backend. The service worker is registered only in a production build. To verify offline use locally, stop the dev server, run `pnpm --dir frontend build` and `pnpm --dir frontend start`, then wait for **Offline ready** before disconnecting. The installed PWA opens `/app`; legacy cookbook, plan, shop, pantry, and import URLs redirect there.

Online import requires the public `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the frontend environment, an owner-configured Supabase project with the reviewed additive migration, and the Mac worker. Those values are public client configuration. Keep `ANTHROPIC_API_KEY_PARSING`, `SUPABASE_SERVICE_ROLE_KEY`, and `IMPORT_OWNER_USER_ID` only in the private Mac worker environment; see [backend/context.md](backend/context.md) and [infra/worker/README.md](infra/worker/README.md). No frontend Anthropic key is used. Direct `POST /api/import/parse` and `POST /api/pantry/receipt` return 410; the personal app imports through `/app#/import`, and receipt parsing is outside this milestone.

To develop the backend and worker separately:

```sh
cd backend
uv sync
uv run python -m allaroundfood
# In another terminal, with private worker environment configured:
uv run python -m allaroundfood.worker --watch
```

The backend is not required for the local `/app` cooking and planning flow. The Mac worker, hosted Supabase schema, and real website/video imports still need deployment verification.

## Keep your data

Open `/app#/settings` to download a JSON backup and verify its counts. The backup includes recipes, plans, shopping, pantry, drafts, cooking progress, and settings. Pending import uploads are excluded. Restore with **Merge backup** on a new profile or device; **Replace local library** first downloads a pre-restore copy and requires confirmation. A different browser, profile, device, or origin has separate storage. Backup transfer is manual; there is no cross-device synchronization. Clearing site data or losing a device can erase local edits unless an external backup exists. Cloud migration copies and verifies the old library; it does not delete cloud originals.

## Verify

```sh
pnpm --dir frontend lint
pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec vitest run
NEXT_PUBLIC_SUPABASE_URL=https://aaf-mock.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=public-test-key pnpm --dir frontend build
cd frontend
NEXT_PUBLIC_SUPABASE_URL=https://aaf-mock.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=public-test-key pnpm test:pwa
```

The production PWA tests require a build first. CI uses `https://aaf-mock.supabase.co` and `public-test-key` as public fixture values, then installs Chromium. Backend checks remain separate, including pricing tests:

```sh
cd backend
uv run ruff check
uv run mypy
uv run pytest
```

Dated observed results and the remaining hosted, migration, Mac, and installed-device gates are in [the release checklist](docs/testing/local-first-pwa-release.md). No GitHub deployment workflow exists yet; Vercel setup and a stable production URL require verification before release. PRs target `dev`; `main` is the release branch.

## Recent updates

<!-- BEGIN:RECENT-UPDATES -->
- Text shopping list to any number via Apple Messages
<!-- END:RECENT-UPDATES -->

## Project map

See [CLAUDE.md](CLAUDE.md), kept identical to [AGENTS.md](AGENTS.md), and the folder `context.md` files.
