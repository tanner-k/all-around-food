# Supabase (Phase 1 — personal re-architecture)

Schema, storage, and the one-time data migration for moving All Around Food off
Parquet `*Store` files and onto Supabase Postgres (see
[`docs/plans/personal-supabase-pivot.md`](../docs/plans/personal-supabase-pivot.md)
and [ADR 0007](../docs/decisions/0007-personal-supabase-rearchitecture.md)).

## Contents

```
supabase/
├── README.md                  ← this file
└── migrations/
    ├── 0001_init.sql          ← extensions, all tables, indexes, RLS policies
    └── 0002_storage.sql       ← private `imports` bucket + storage RLS policies
```

## Required environment

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | migration script, frontend, worker | Project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **migration script + worker only** | Bypasses RLS. **Never** ship to the browser/Vercel. |
| `SUPABASE_ANON_KEY` | frontend (PWA) + keep-alive workflow | Public anon key; safe in the client, gated by RLS. |
| `OWNER_USER_ID` | **migration script only** | uuid of the Supabase auth user that will own every migrated row. Create that user first (**Dashboard → Authentication → Users**), then copy its uuid. Required for a real run; not needed for `--dry-run`. |

## Applying the migrations

Run `0001_init.sql` then `0002_storage.sql`, in order. Pick one method:

### Supabase CLI (recommended)

```bash
supabase link --project-ref <your-project-ref>
supabase db push          # applies everything under supabase/migrations/
```

### `psql` against the database

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_storage.sql
```

`$SUPABASE_DB_URL` is the connection string from
**Project Settings → Database → Connection string** (use the session/pooler URL).

### Supabase SQL editor

Open **SQL Editor** in the dashboard, paste the contents of `0001_init.sql`,
run it, then do the same for `0002_storage.sql`.

The migrations are idempotent (`create ... if not exists`,
`on conflict do nothing`, `drop policy if exists`), so re-running is safe.

> The `vector` (pgvector) extension is enabled by `0001_init.sql`. If your
> project blocks `create extension`, enable **Vector** under
> **Database → Extensions** in the dashboard first.

## Migrating existing Parquet data

After the schema is applied, load the existing `data/*.parquet` rows:

```bash
# from the repo root, with the migrate dep group installed (see below)
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
# uuid of your Supabase auth user (Dashboard → Authentication → Users); stamped
# as the owner of every migrated row. Create that user first.
export OWNER_USER_ID=<auth-user-uuid>

# preview row counts without writing (no credentials/owner needed)
python backend/scripts/migrate_parquet_to_supabase.py --dry-run

# migrate everything
python backend/scripts/migrate_parquet_to_supabase.py

# or a subset (repeatable); planned_meals is derived from meal_plans
python backend/scripts/migrate_parquet_to_supabase.py --only recipes --only pantry
```

Flags: `--dry-run`, `--only <table>` (repeatable), `--data-dir <path>` (default
`data/`). The script is idempotent — it upserts on `id`, skips tables whose
parquet file is absent (pricing/receipts may not exist yet), explodes
`meal_plans.meals` into `planned_meals`, decodes JSON-string columns into
`jsonb`, ISO-formats datetimes, and renders `canonical_products.embedding` as a
pgvector literal. The service-role key bypasses RLS, which is expected here;
every row is stamped with `OWNER_USER_ID` so it is visible under RLS afterward.

### Installing the migration dependency

The script needs the `supabase` Python client, declared in the **`migrate`**
dependency group in `backend/pyproject.toml`:

```bash
cd backend
uv sync --group migrate      # or: pip install "supabase>=2.0"
```

## Tables created

`recipes`, `meal_plans`, `planned_meals`, `shopping_list_items`,
`pantry_items`, `evaluations`, `store_locations`, `canonical_products`,
`retailer_skus`, `price_observations`, `receipts`, `parse_jobs`.

Every table has a `text` primary key `id` (existing ids are arbitrary strings),
a `user_id uuid not null default auth.uid()`, RLS enabled, and a permissive
`owner` policy (`user_id = auth.uid()`). `canonical_products.embedding` is
`vector(384)` with an `ivfflat` cosine index.

## Keeping the free project awake

A free-tier Supabase project auto-pauses after ~1 week of inactivity. The
`.github/workflows/supabase-keepalive.yml` workflow runs **weekly** (Mondays
12:00 UTC, plus manual `workflow_dispatch`) and makes one authenticated REST read
so the project stays active; it fails if the API does not return 2xx. It needs
two GitHub repo secrets: `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
