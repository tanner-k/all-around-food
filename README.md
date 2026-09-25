# all-around-food

A personal cooking app for planning meals, saving recipes, shopping, tracking pantry stock, and cooking step by step. The `/app` experience stores its everyday library in this browser's IndexedDB and is designed to reopen offline after its PWA shell is ready. Online imports use a private Supabase queue and a separate Mac Mini worker. [ADR 0008](docs/decisions/0008-local-first-pwa.md) is still proposed; physical-device and recovery checks remain open.

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

Online import requires the public `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the frontend environment, an owner-configured Supabase project with the reviewed additive migration, and the Mac worker. Those values are public client configuration. Keep `TYPESAFE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `IMPORT_OWNER_USER_ID` only in the private Mac worker environment; see [backend/context.md](backend/context.md) and [infra/worker/README.md](infra/worker/README.md). Recipe imports use Jev classification, local CPU transcription, and local screenshot OCR. No Anthropic calls are made by imports. Direct `POST /api/import/parse` and `POST /api/pantry/receipt` return 410; the personal app imports through `/app#/import`, and receipt parsing is outside this milestone.

To develop the backend and worker separately:

```sh
cd backend
uv sync
uv run python -m allaroundfood
# In another terminal, with private worker environment configured:
uv run python -m allaroundfood.worker --watch
```

The backend is not required for the local `/app` cooking and planning flow. A real paste-text import has been verified against the hosted queue and Mac worker; website and video source access varies and needs separate checks.

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

Dated observed results and remaining release checks are in [the release record](docs/testing/local-first-pwa-release.md). PRs target `dev`; `main` is the release branch.

## Deployment

Vercel serves production at https://all-around-food.vercel.app/app from `main` (PR #12, commit `19145a53c5e06dfea06f26e0328fe760c96a5418`); the production deployment succeeded. Supabase project `pkvdoucwssyjltvqsxcq` has the additive `0001`–`0005` migrations and an existing single owner configured. The Mac Mini runs the import worker as LaunchAgent `com.allaroundfood.worker`, polling every 30 seconds after login from its Python 3.12 virtualenv. Its private mode-600 environment holds Jev and service-role credentials; Vercel uses only public Supabase configuration. See [worker operation](infra/worker/README.md) and the [release record](docs/testing/local-first-pwa-release.md) before treating physical-device use or recovery as verified.

## Recent updates

<!-- BEGIN:RECENT-UPDATES -->
- Implement source-grounded Jev recipe parsing in the import worker
- Archived migrated core Parquet files under `data/archive/` after Supabase row counts matched.
- Cut over the app from hosted server proxies to Supabase reads/writes plus the local import worker.
- Removed the deferred user-facing pricing surface while keeping the backend pricing library.
- Deleted the Python HTTP server, proxy routes, and core Parquet store path after adding Supabase evaluation stats.
<!-- END:RECENT-UPDATES -->

## Project map

See [CLAUDE.md](CLAUDE.md), kept identical to [AGENTS.md](AGENTS.md), and the folder `context.md` files.
