# data/

## Scope

Legacy Parquet/CSV schemas, seed data, and archives for the FastAPI/Polars backend. The personal `/app` library is stored in browser IndexedDB, not these files. Signed-in recipes and shared import drafts sync with Supabase while retaining their IndexedDB copy; plans, shopping, pantry, and cooking remain device-only. Hosted import and account-library migrations and SQL tests live under `supabase/`.

## Data files

- `recipes.parquet` — legacy saved recipes
- `evaluations.parquet` — legacy parse evaluations
- `pantry.parquet`, `shopping_list.parquet`, `meal_plans.parquet` — legacy pantry, shopping, and plans
- `archive/` — historical data; preserve during the local-first migration

Files are created lazily on first save. Do not edit or delete archives as a side effect of the PWA release. Existing recipes can be copied into the signed-in account only through the reviewed Settings flow, with source/account backups and duplicate review; other collections remain in their original stores/backups. Backup files remain available for manual recovery between browser profiles/devices.

## Conventions

Keep backend schema changes and tests coordinated. Never rewrite a migration already applied to a real database. Check actual Supabase migration history and reconcile version collisions before applying the local import draft migration; see `supabase/README.md` and `docs/testing/local-first-pwa-release.md`.
