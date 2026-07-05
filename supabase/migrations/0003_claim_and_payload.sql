-- 0003_claim_and_payload.sql — parse queue: pasted-text payload + atomic claim
-- (Phase 3/4, ADR 0007; see docs/plans/import-queue-worker.md)
--
-- Three small additions to the Phase 1 `parse_jobs` table:
--   1. `payload_text` — a home for pasted-text imports (shopping lists) that have
--      neither a `source_url` nor an uploaded `storage_path`.
--   2. `recover_stale_parse_jobs(...)` — moves abandoned `processing` rows back
--      to `pending`, or to `error` once they have exhausted attempts.
--   3. `claim_parse_jobs(...)` — an atomic claim function the worker calls to move
--      pending jobs to `processing` without two concurrent `--once` runs grabbing
--      the same row. Uses `for update skip locked`; also enforces a poison-job
--      retry cap so a permanently failing job is not reclaimed forever.
--
-- Idempotent: `add column if not exists`, `create or replace function`.

-- ---------------------------------------------------------------------------
-- 1. Pasted-text payload for text-only import kinds (e.g. shopping_list).
-- ---------------------------------------------------------------------------
alter table public.parse_jobs
    add column if not exists payload_text text;


-- ---------------------------------------------------------------------------
-- 2. Stale processing recovery. If a worker is killed after claiming a job, the
--    row can otherwise stay `processing` forever. Under the retry cap, send it
--    back to `pending`; at/over the cap, mark it `error` so the UI can offer a
--    manual retry instead of pretending it is still running.
-- ---------------------------------------------------------------------------
create or replace function public.recover_stale_parse_jobs(
    p_stale_after_minutes int default 30,
    p_max_attempts int default 3
)
returns setof public.parse_jobs
language sql
security definer
set search_path = public
as $$
    update public.parse_jobs j
       set status = case
               when attempts >= p_max_attempts then 'error'
               else 'pending'
           end,
           error = case
               when attempts >= p_max_attempts
                   then 'Worker timed out after the maximum retry attempts.'
               else error
           end,
           updated_at = now()
     where status = 'processing'
       and updated_at < now() - make_interval(mins => p_stale_after_minutes)
    returning j.*;
$$;


-- ---------------------------------------------------------------------------
-- 3. Atomic claim: flip up to p_limit pending jobs to 'processing' and return
--    them. `for update skip locked` lets overlapping worker runs claim disjoint
--    sets. `attempts` is bumped here (on claim) so the retry cap holds even if a
--    run crashes mid-job; a job is eligible only while attempts < p_max_attempts.
--
--    security definer + explicit search_path so the worker's service-role call
--    executes with a stable, injection-safe path. RLS is bypassed by the
--    service-role key the worker uses (the same key the migration script uses).
-- ---------------------------------------------------------------------------
create or replace function public.claim_parse_jobs(
    p_limit int default 10,
    p_max_attempts int default 3
)
returns setof public.parse_jobs
language sql
security definer
set search_path = public
as $$
    update public.parse_jobs j
       set status = 'processing',
           attempts = attempts + 1,
           updated_at = now()
     where j.id in (
         select id
           from public.parse_jobs
          where status = 'pending'
            and attempts < p_max_attempts
          order by created_at
          limit p_limit
          for update skip locked
     )
    returning j.*;
$$;
