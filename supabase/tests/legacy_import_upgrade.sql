-- Pre-upgrade regression for migration 0005.
--
-- Run against a disposable database that has migrations 0001-0004 applied and
-- the pre-lease worker stopped. The script seeds rows the way the old protocol
-- left them, applies 0005 itself, then asserts the upgrade recovered them:
--
--   psql "$AAF_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/legacy_import_upgrade.sql
--
-- Requires AAF_TEST_DISPOSABLE_PROJECT=YES and AAF_TEST_OWNER_ID (an auth user).
-- A bare PostgreSQL harness must also grant `service_role` access to the public
-- tables, which hosted Supabase grants by default.
\set disposable NO
\getenv disposable AAF_TEST_DISPOSABLE_PROJECT
select 1 / case when :'disposable' = 'YES' then 1 else 0 end as disposable_project_guard;
\set owner NO
\getenv owner AAF_TEST_OWNER_ID
select 1 / case when (select count(*) from auth.users where id = :'owner'::uuid) = 1
  then 1 else 0 end as test_account_guard;
select set_config('app.test.owner', :'owner', false);

-- Rows exactly as the old worker left them: processing, no lease, no token.
insert into public.recipes(id, user_id, title)
values ('legacy-recipe', current_setting('app.test.owner')::uuid, 'Legacy toast');
insert into public.parse_jobs(id, user_id, kind, source_url, status, attempts, result_recipe_id, created_at)
values
  ('11111111-2222-4333-8444-555555555551', current_setting('app.test.owner')::uuid,
   'url', 'https://example.com/a', 'processing', 1, null, now() - interval '2 hours'),
  ('11111111-2222-4333-8444-555555555552', current_setting('app.test.owner')::uuid,
   'url', 'https://example.com/b', 'processing', 3, null, now() - interval '3 hours'),
  ('11111111-2222-4333-8444-555555555553', current_setting('app.test.owner')::uuid,
   'url', 'https://example.com/c', 'done', 1, 'legacy-recipe', now() - interval '4 hours');

\ir ../migrations/0005_local_recipe_drafts.sql

insert into app_private.import_owner(singleton, user_id)
values (true, current_setting('app.test.owner')::uuid)
on conflict (singleton) do update set user_id = excluded.user_id;

do $$
declare claimed public.parse_jobs;
begin
  if (select status from public.parse_jobs where id = '11111111-2222-4333-8444-555555555551')
     is distinct from 'pending'
  then raise exception 'unfinished legacy job was not requeued'; end if;

  if not exists (select 1 from public.parse_jobs
    where id = '11111111-2222-4333-8444-555555555552'
      and status = 'error' and error = 'Import failed after 3 attempts')
  then raise exception 'exhausted legacy job is not visibly failed'; end if;

  if not exists (select 1 from public.parse_jobs
    where id = '11111111-2222-4333-8444-555555555553'
      and status = 'done' and result_recipe_id = 'legacy-recipe')
  then raise exception 'completed legacy result was changed'; end if;
  if (select count(*) from public.recipes where id = 'legacy-recipe') <> 1
  then raise exception 'legacy source library was changed'; end if;

  -- The requeued job must be claimable under the new fenced protocol.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  set local role service_role;
  select * into claimed from public.claim_parse_jobs(1);
  reset role;
  if claimed.id <> '11111111-2222-4333-8444-555555555551'
  then raise exception 'recovered job is not claimable: %', claimed.id; end if;
  if claimed.claim_token is null or claimed.lease_until <= now() or claimed.attempts <> 2
  then raise exception 'recovered job claimed without a live lease'; end if;
end $$;

select 'legacy import upgrade ok' as result;
