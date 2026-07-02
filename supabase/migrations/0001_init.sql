-- 0001_init.sql — All Around Food: personal Supabase schema (Phase 1, ADR 0007)
--
-- Mirrors the Polars *Store column definitions exactly. Design rules:
--   * Existing ids are arbitrary strings → every PK is `id text` (NOT uuid).
--   * Foreign keys are `text references ...` to match those string ids.
--   * Every table carries `user_id uuid not null default auth.uid()` so multi-user
--     is a policy change, not a migration (ADR 0007 decision 2).
--   * JSON-shaped columns → jsonb. Money → integer cents. Embedding → vector(384).
--   * Enums modelled as `check (... in (...))` constraints (simpler than native types).
--   * Idempotent where reasonable: `create extension if not exists`,
--     `create table if not exists`, `drop policy if exists` before create.
--
-- The data-migration script (backend/scripts/migrate_parquet_to_supabase.py) runs
-- with the service-role key, which bypasses RLS — that is expected.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists vector;  -- pgvector, for canonical_products.embedding


-- ===========================================================================
-- recipes  (mirrors RecipeStore in backend/src/allaroundfood/storage.py)
-- ===========================================================================
create table if not exists public.recipes (
    id                    text primary key,
    user_id               uuid not null default auth.uid(),
    title                 text not null,
    description           text,
    source_url            text,
    source_attribution    text,
    prep_time_min         integer,
    cook_time_min         integer,
    total_time_min        integer,
    servings              integer,
    yield_text            text,
    cuisine               text,
    course                text,
    difficulty            text check (difficulty in ('easy', 'medium', 'hard')),
    notes                 text,
    storage_instructions  text,
    created_at            timestamptz not null default now(),  -- domain column on the store
    times_made            integer not null default 0,
    parse_confidence      double precision,
    -- JSON-shaped fields (stored as JSON strings in Parquet → jsonb here)
    ingredients           jsonb not null default '[]'::jsonb,
    steps                 jsonb not null default '[]'::jsonb,
    equipment             jsonb not null default '[]'::jsonb,
    dietary_tags          jsonb not null default '[]'::jsonb,
    nutrition             jsonb
);


-- ===========================================================================
-- meal_plans + planned_meals
-- ---------------------------------------------------------------------------
-- MealPlanStore stores one row per week keyed on `week_of`, with `meals` as a
-- JSON list of PlannedMeal({day_index, recipe_id}) and an `updated_at`. There is
-- no `id` and no `created_at` on the store. We model the plan header in
-- `meal_plans` (PK = week_of, the natural key) and break the nested `meals`
-- list out into a child table `planned_meals` (one row per recipe-on-a-day) so
-- each slot is independently queryable and FK-linked to recipes. The migration
-- script explodes meal_plans.meals into planned_meals rows.
-- ===========================================================================
create table if not exists public.meal_plans (
    id          text primary key,           -- natural key = week_of (ISO Monday)
    user_id     uuid not null default auth.uid(),
    week_of     text not null,              -- ISO date (YYYY-MM-DD) of that week's Monday
    updated_at  timestamptz not null default now(),
    created_at  timestamptz not null default now()  -- added: store has no created_at
);

create table if not exists public.planned_meals (
    id            text primary key,
    user_id       uuid not null default auth.uid(),
    meal_plan_id  text not null references public.meal_plans(id) on delete cascade,
    day_index     integer not null check (day_index between 0 and 6),  -- 0=Mon .. 6=Sun
    recipe_id     text references public.recipes(id) on delete set null,
    created_at    timestamptz not null default now()
);


-- ===========================================================================
-- shopping_list_items  (mirrors ShoppingListStore)
-- ===========================================================================
create table if not exists public.shopping_list_items (
    id                text primary key,
    user_id           uuid not null default auth.uid(),
    name              text not null,
    quantity_text     text,
    aisle             text not null default 'Other'
                          check (aisle in ('Produce', 'Dairy', 'Meat', 'Bakery', 'Pantry',
                                           'Frozen', 'Beverages', 'Household', 'Other')),
    checked           boolean not null default false,
    source            text not null default 'manual'
                          check (source in ('manual', 'recipe', 'planner')),
    source_recipe_id  text references public.recipes(id) on delete set null,
    pantry_covered    boolean not null default false,
    pantry_low        boolean not null default false,
    created_at        timestamptz not null default now()
);


-- ===========================================================================
-- pantry_items  (mirrors PantryStore)
-- ===========================================================================
create table if not exists public.pantry_items (
    id                text primary key,
    user_id           uuid not null default auth.uid(),
    name              text not null,
    status            text not null default 'in_stock'
                          check (status in ('in_stock', 'low', 'out')),
    aisle             text not null default 'Other'
                          check (aisle in ('Produce', 'Dairy', 'Meat', 'Bakery', 'Pantry',
                                           'Frozen', 'Beverages', 'Household', 'Other')),
    aisle_overridden  boolean not null default false,
    notes             text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);


-- ===========================================================================
-- evaluations  (mirrors EvalStore)
-- ===========================================================================
create table if not exists public.evaluations (
    id                             text primary key,
    user_id                        uuid not null default auth.uid(),
    created_at                     timestamptz not null default now(),  -- domain column
    source_kind                    text check (source_kind in ('image', 'url')),
    source_ref                     text,
    worker_model                   text,
    worker_prompt                  text,
    worker_output                  text,
    worker_parse_confidence        double precision,
    judge_model                    text,
    judge_prompt                   text,
    overall_grade                  integer,
    accuracy_grade                 integer,
    completeness_grade             integer,
    reasoning                      text,
    suggested_prompt_improvements  text,
    raw_judge_output               text,
    strengths                      jsonb not null default '[]'::jsonb,
    weaknesses                     jsonb not null default '[]'::jsonb,
    field_checks                   jsonb not null default '[]'::jsonb
);


-- ===========================================================================
-- Pricing domain (mirrors backend/src/allaroundfood/pricing/store/*.py)
-- ===========================================================================

-- store_locations -----------------------------------------------------------
create table if not exists public.store_locations (
    id                text primary key,
    user_id           uuid not null default auth.uid(),
    retailer          text not null
                          check (retailer in ('kroger', 'walmart', 'costco',
                                              'wholefoods', 'instacart', 'ubereats')),
    store_id          text not null,
    name              text not null,
    address           text not null,
    zip               text not null,
    lat               double precision not null,
    lon               double precision not null,
    fulfillment_zone  text,
    metadata          jsonb not null default '{}'::jsonb,
    created_at        timestamptz not null default now()  -- added: store has no created_at
);

-- canonical_products --------------------------------------------------------
create table if not exists public.canonical_products (
    id          text primary key,
    user_id     uuid not null default auth.uid(),
    gtin        text,
    brand       text,
    name        text not null,
    size_value  double precision,
    size_unit   text,
    category    text,
    attributes  jsonb not null default '{}'::jsonb,
    embedding   vector(384),                 -- bge-small-en-v1.5 (ADR 0004); null when unset
    created_at  timestamptz not null default now(),  -- domain column
    updated_at  timestamptz not null default now()   -- domain column
);

-- retailer_skus -------------------------------------------------------------
create table if not exists public.retailer_skus (
    id                    text primary key,
    user_id               uuid not null default auth.uid(),
    canonical_product_id  text not null references public.canonical_products(id) on delete cascade,
    retailer              text not null,
    retailer_sku          text not null,
    url                   text,
    title_raw             text not null,
    size_raw              text,
    last_seen_at          timestamptz not null,
    match_method          text not null
                              check (match_method in ('upc', 'fuzzy', 'embedding', 'manual')),
    match_confidence      double precision not null,
    retailer_meta         jsonb not null default '{}'::jsonb,
    created_at            timestamptz not null default now()  -- added: store has no created_at
);

-- price_observations --------------------------------------------------------
create table if not exists public.price_observations (
    id                    text primary key,
    user_id               uuid not null default auth.uid(),
    retailer              text not null,
    store_location_id     text references public.store_locations(id) on delete set null,
    retailer_sku_id       text references public.retailer_skus(id) on delete set null,
    canonical_product_id  text references public.canonical_products(id) on delete set null,
    price_cents           integer not null,
    unit_price_cents      integer,
    was_on_promo          boolean not null default false,
    promo_text            text,
    promo_price_cents     integer,
    currency              text not null default 'USD',
    observed_at           timestamptz not null,        -- domain column
    source_tier           text not null
                              check (source_tier in ('api', 'json', 'browser', 'ocr', 'manual')),
    raw_response_hash     text not null,
    created_at            timestamptz not null default now()  -- added: store has no created_at
);


-- ===========================================================================
-- receipts  (mirrors ReceiptStore; line_items_json → line_items jsonb)
-- ===========================================================================
create table if not exists public.receipts (
    id                 text primary key,
    user_id            uuid not null default auth.uid(),
    image_path         text not null,
    retailer_guess     text,
    store_location_id  text references public.store_locations(id) on delete set null,
    purchased_at       timestamptz,
    subtotal_cents     integer,
    tax_cents          integer,
    total_cents        integer,
    raw_text           text,
    parser_engine      text check (parser_engine in ('qwen-vl')),
    llm_model          text,
    parse_confidence   double precision,
    created_at         timestamptz not null default now(),  -- domain column
    line_items         jsonb not null default '[]'::jsonb   -- from line_items_json
);


-- ===========================================================================
-- parse_jobs  (new — Phase 3 import queue)
-- ===========================================================================
create table if not exists public.parse_jobs (
    id                text primary key default gen_random_uuid()::text,
    user_id           uuid not null default auth.uid(),
    kind              text not null
                          check (kind in ('url', 'screenshot', 'video',
                                          'shopping_list', 'receipt')),
    source_url        text,
    storage_path      text,
    status            text not null default 'pending'
                          check (status in ('pending', 'processing', 'done', 'error')),
    attempts          integer not null default 0,
    error             text,
    result_recipe_id  text references public.recipes(id) on delete set null,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);


-- ===========================================================================
-- Indexes — btree on every FK column + the queue/pricing lookups, ivfflat on
-- the embedding for cosine similarity search.
-- ===========================================================================
create index if not exists idx_planned_meals_meal_plan_id
    on public.planned_meals (meal_plan_id);
create index if not exists idx_planned_meals_recipe_id
    on public.planned_meals (recipe_id);

create index if not exists idx_shopping_list_items_source_recipe_id
    on public.shopping_list_items (source_recipe_id);

create index if not exists idx_retailer_skus_canonical_product_id
    on public.retailer_skus (canonical_product_id);

create index if not exists idx_price_observations_store_location_id
    on public.price_observations (store_location_id);
create index if not exists idx_price_observations_retailer_sku_id
    on public.price_observations (retailer_sku_id);
create index if not exists idx_price_observations_canonical_product_id
    on public.price_observations (canonical_product_id);

create index if not exists idx_receipts_store_location_id
    on public.receipts (store_location_id);

create index if not exists idx_parse_jobs_result_recipe_id
    on public.parse_jobs (result_recipe_id);
create index if not exists idx_parse_jobs_status
    on public.parse_jobs (status);

-- pgvector cosine-similarity index on canonical_products.embedding.
-- ivfflat needs a populated table to build well; if the table is empty at
-- migration time the index is still valid and is used once rows land.
create index if not exists idx_canonical_products_embedding
    on public.canonical_products
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);


-- ===========================================================================
-- Row-Level Security — enable on every table + a permissive owner policy.
-- Single user today; multi-user is a policy change, not a migration.
-- ===========================================================================
alter table public.recipes              enable row level security;
alter table public.meal_plans           enable row level security;
alter table public.planned_meals        enable row level security;
alter table public.shopping_list_items  enable row level security;
alter table public.pantry_items         enable row level security;
alter table public.evaluations          enable row level security;
alter table public.store_locations      enable row level security;
alter table public.canonical_products   enable row level security;
alter table public.retailer_skus        enable row level security;
alter table public.price_observations   enable row level security;
alter table public.receipts             enable row level security;
alter table public.parse_jobs           enable row level security;

drop policy if exists "owner" on public.recipes;
create policy "owner" on public.recipes
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner" on public.meal_plans;
create policy "owner" on public.meal_plans
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner" on public.planned_meals;
create policy "owner" on public.planned_meals
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner" on public.shopping_list_items;
create policy "owner" on public.shopping_list_items
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner" on public.pantry_items;
create policy "owner" on public.pantry_items
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner" on public.evaluations;
create policy "owner" on public.evaluations
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner" on public.store_locations;
create policy "owner" on public.store_locations
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner" on public.canonical_products;
create policy "owner" on public.canonical_products
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner" on public.retailer_skus;
create policy "owner" on public.retailer_skus
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner" on public.price_observations;
create policy "owner" on public.price_observations
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner" on public.receipts;
create policy "owner" on public.receipts
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner" on public.parse_jobs;
create policy "owner" on public.parse_jobs
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
