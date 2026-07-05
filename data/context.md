# data/

## Scope
- Supabase migration files
- Archived Parquet files used for one-time migration/seeding
- Deferred pricing/OCR Parquet paths

## Not in scope
- Worker code → `backend/`
- UI-side data shaping → `frontend/`
- Infrastructure provisioning the database → `infra/`

## Stack
Supabase Postgres migrations; Parquet remains only for archive/migration inputs and deferred pricing/OCR stores

## Data files
- `recipes.parquet`, `evaluations.parquet`, `pantry.parquet`, `shopping_list.parquet`, `meal_plans.parquet` — legacy core app data, migrated to Supabase via `backend/scripts/migrate_parquet_to_supabase.py`.
- `receipts.parquet` and `data/pricing/*.parquet` — deferred OCR/pricing paths retained for worker/library use.

## Local skills / conventions
- None yet — add as needed

## Migration workflow
1. Add a new SQL file under `supabase/migrations/`.
2. Make it idempotent where practical.
3. Apply with `supabase db push`.
4. Commit the migration alongside the code that uses it.

## Notes for agents
- Never edit a migration that has shipped to `main` — write a new one
- Schema changes that break the API must come with a coordinated `backend/` change in the same PR
- Test data lives in `data/seeds/` — keep it small and meaningful, not exhaustive
