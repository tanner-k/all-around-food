-- 0004_queue_only.sql — ADR 0008: Supabase demoted to parse queue + URL cache.
--
-- DESTRUCTIVE by design: all per-domain app data moves on-device (SwiftData).
-- Recipes must be exported first via backend/scripts/export_recipes_to_json.py.
-- Do NOT apply until that export has been run and verified.

begin;

-- ── Demoted tables (data lives on-device now; code stays in git history) ───
drop table if exists public.price_observations;
drop table if exists public.retailer_skus;
drop table if exists public.canonical_products;
drop table if exists public.store_locations;
drop table if exists public.receipts;
drop table if exists public.evaluations;
drop table if exists public.shopping_list_items;
drop table if exists public.pantry_items;
drop table if exists public.planned_meals;
drop table if exists public.meal_plans;
drop table if exists public.recipes cascade;

drop function if exists public.claim_parse_jobs(integer, integer);
drop table if exists public.parse_jobs;

-- ── URL cache ───────────────────────────────────────────────────────────────
-- Screenshot results use the synthetic key 'screenshot:<storage_path>'.
create table public.parse_results (
    normalized_url  text primary key,
    recipe          jsonb not null,
    transcript      text,
    created_at      timestamptz not null default now()
);

-- ── Queue ───────────────────────────────────────────────────────────────────
create table public.parse_jobs (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null default auth.uid(),
    source_url       text,
    screenshot_path  text,
    status           text not null default 'pending'
                     check (status in ('pending', 'running', 'done', 'failed')),
    error            text,
    result_url       text references public.parse_results (normalized_url),
    attempts         integer not null default 0,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    check (source_url is not null or screenshot_path is not null)
);

create index parse_jobs_pending_idx
    on public.parse_jobs (created_at) where status = 'pending';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.parse_jobs enable row level security;
alter table public.parse_results enable row level security;

drop policy if exists "own jobs" on public.parse_jobs;
create policy "own jobs" on public.parse_jobs
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "authenticated read results" on public.parse_results;
create policy "authenticated read results" on public.parse_results
    for select to authenticated using (true);

-- ── Claim RPC (service-role caller; skip-locked so overlapping runs are safe)
create function public.claim_parse_jobs(p_limit integer, p_max_attempts integer)
returns setof public.parse_jobs
language sql
security definer
set search_path = public
as $$
    update public.parse_jobs j
       set status = 'running', attempts = j.attempts + 1, updated_at = now()
     where j.id in (
         select id from public.parse_jobs
          where status = 'pending' and attempts < p_max_attempts
          order by created_at
          limit p_limit
            for update skip locked
     )
    returning j.*;
$$;

commit;

-- Screenshot uploads reuse the existing private 'imports' bucket from
-- 0002_storage.sql (owner-scoped RLS already in place) — no new bucket.
