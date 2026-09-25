# data/

## Scope

Legacy Parquet/CSV schemas, seed data, and archives for the FastAPI/Polars backend. The personal `/app` library is stored in browser IndexedDB, not these files. Hosted temporary import queue migrations and SQL tests live under `supabase/`.

## Data files

- `recipes.parquet` — legacy saved recipes
- `evaluations.parquet` — legacy parse evaluations
- `pantry.parquet`, `shopping_list.parquet`, `meal_plans.parquet` — legacy pantry, shopping, and plans
- `archive/` — historical data; preserve during the local-first migration

Files are created lazily on first save. Do not edit or delete archives as a side effect of the PWA release. The owner-only cloud export copies existing Supabase records into the target browser and verifies them separately; backup files transfer local records between browser profiles/devices manually.

## Conventions

Keep backend schema changes and tests coordinated. Never rewrite a migration already applied to a real database. Check actual Supabase migration history and reconcile version collisions before applying the local import draft migration; see `supabase/README.md` and `docs/testing/local-first-pwa-release.md`.
