# Supabase import coordination and account library

Supabase retains the legacy cloud library, owner-only export, evaluation stats,
and the temporary recipe-import queue. Migration `0006` adds an owner-scoped
revision journal and current library projection for account sync; each device
continues working from IndexedDB. The personal `/app` library originally lived in
IndexedDB alone; existing cloud and Parquet records are preserved during migration (see
[`docs/plans/personal-supabase-pivot.md`](../docs/plans/personal-supabase-pivot.md)
and [ADR 0007](../docs/decisions/0007-personal-supabase-rearchitecture.md)).

## Contents

```
supabase/
├── README.md                  ← this file
└── migrations/
    ├── 0001_init.sql          ← extensions, all tables, indexes, RLS policies
    ├── 0002_storage.sql       ← private `imports` bucket + storage RLS policies
    ├── 0003_claim_and_payload.sql ← deployed legacy queue history
    ├── 0004_evaluation_stats.sql ← owner-scoped evaluation view
    ├── 0005_local_recipe_drafts.sql ← token-fenced transient drafts
    └── 0006_library_sync.sql ← owner-scoped library, immutable revision batches, push/pull RPCs
```

## Required environment

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | migration script, frontend, worker | Project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **migration script + worker only** | Bypasses RLS. **Never** ship to the browser/Vercel. |
| `SUPABASE_ANON_KEY` | frontend online imports/export + keep-alive workflow | Public anon key; safe in the client, gated by RLS. |
| `OWNER_USER_ID` | **migration script only** | uuid of the Supabase auth user that will own every migrated row. Create that user first (**Dashboard → Authentication → Users**), then copy its uuid. Required for a real run; not needed for `--dry-run`. |

## Applying the migrations

Run numbered migrations in order through `0006_library_sync.sql`. Check `supabase_migrations.schema_migrations` in each target first: dev uses version `0004` for evaluation stats. If a target already recorded version `0004` for local drafts, reconcile that database explicitly before applying anything. Pick one method:

### Supabase CLI (recommended)

```bash
supabase link --project-ref <your-project-ref>
supabase db push          # applies everything under supabase/migrations/
```

### `psql` against the database

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_storage.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0003_claim_and_payload.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0004_evaluation_stats.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0005_local_recipe_drafts.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0006_library_sync.sql
```

`$SUPABASE_DB_URL` is the connection string from
**Project Settings → Database → Connection string** (use the session/pooler URL).

### Supabase SQL editor

Open **SQL Editor** in the dashboard, paste the contents of `0001_init.sql`,
run it, then do the same for `0002_storage.sql` through `0006_library_sync.sql` in order.

Apply each migration once. Track applied files before using the SQL editor or `psql`.

Before using imports, set the personal owner in the SQL editor (as the database
administrator), substituting the existing auth user UUID. Until configured,
import policies and claims fail closed:

```sql
insert into app_private.import_owner(singleton, user_id)
values (true, '<existing-owner-auth-uuid>')
on conflict (singleton) do update set user_id = excluded.user_id;
```

Disable public sign-ups under **Authentication → Providers → Email** (and any
other enabled providers) in the Supabase dashboard. Only invite/create the owner
account. The worker must also set `IMPORT_OWNER_USER_ID` to this same UUID.

Run `supabase/tests/local_recipe_drafts.sql` only against a separate disposable
project with two actual test users and all migrations applied. Set
`AAF_TEST_DATABASE_URL`, `AAF_TEST_OWNER_ID`, `AAF_TEST_OTHER_ID`, and
`AAF_TEST_DISPOSABLE_PROJECT=YES`, then run:

```bash
psql "$AAF_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/local_recipe_drafts.sql
```

The suite rolls back its rows and temporary owner configuration. The explicit
guard prevents accidental execution without the disposable-project flag.

For the account library, apply `0006_library_sync.sql` to a dedicated disposable
PostgreSQL database with the same two auth fixtures, then run
`supabase/tests/library_sync.sql`. Its transaction rolls back. Run
`supabase/tests/library_sync_concurrency.sql` separately against that same
**dedicated disposable** database; it uses `dblink` to hold one connection's
commit while a second writer waits and it commits test rows. Never run either
fixture against the hosted project or a database containing real data.

The browser RPCs are `push_library_changes(p_request jsonb)` and
`pull_library_changes(p_after_revision bigint default 0, p_max_revisions int
default 10)`. Push accepts protocol version 1, a stable `mutation_id`, and 1–100
conditional changes within 1 MiB. Exact retries return the original accepted
response; stale bases return conflict records. Pull returns complete revision
batches (1–50 per page) from the immutable private journal, with
`next_revision` and `has_more`. Only the configured signed-in owner can call
these RPCs or read `public.library_records`; direct browser writes and all
browser access to private sync state are denied. This migration creates new
tables and does not modify the legacy library, import queue, or worker.

> The `vector` (pgvector) extension is enabled by `0001_init.sql`. If your
> project blocks `create extension`, enable **Vector** under
> **Database → Extensions** in the dashboard first.

## Migrating existing Parquet data

For legacy Supabase migration only, the existing Parquet import script remains available. It is not the browser IndexedDB copy step. After the schema is applied, load existing `data/*.parquet` rows only when that separate migration is intended:

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

Set those in **GitHub → Settings → Secrets and variables → Actions**:

```text
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=<anon-key>
```

Manual check: open **Actions → Supabase keepalive → Run workflow**. A passing run
confirms the URL/key pair can read through the REST API. Keep the service-role
key out of this workflow; only the local worker and migration script need it.

## Shared import publication (0007)
`finish_import_job(text,uuid,jsonb,jsonb)` keeps the worker interface and now publishes a validated library draft plus immutable revision batch in the same transaction as `done`. It locks owner head then job row and rechecks the lease with wall-clock time after waiting. Existing drafts, tombstones, and saved/deleted recipes are never overwritten.

Migration backfill reports published/skipped/invalid completed rows. Service-only `backfill_import_drafts()` can retry still-present results; invalid/unpublished completed sources remain for recovery. Already-cleaned results require a surviving device's reviewed migration. Acknowledgement and cleanup affect only temporary job/source fields, never shared records.

Disposable SQL checks: `supabase/tests/shared_imports.sql` (rollback) and `shared_imports_concurrency.sql` (commits fixture setup; use only `aaf_sync_task1`). Run with the same environment guards as the library protocol fixtures after migrations 0006/0007. No hosted application of these migrations is authorized by these tests.
