-- Two PostgreSQL connections against a dedicated disposable test database only.
-- Requires the same environment guards as library_sync.sql; this test commits.
\set disposable NO
\getenv disposable AAF_TEST_DISPOSABLE_PROJECT
select 1 / case when :'disposable' = 'YES' and current_database() not in ('postgres','aaf_full','aaf_upgrade') then 1 else 0 end;
\set owner NO
\getenv owner AAF_TEST_OWNER_ID
select 1 / case when (select count(*) from auth.users where id = :'owner'::uuid) = 1 then 1 else 0 end;
create extension if not exists dblink;
insert into app_private.import_owner(singleton,user_id) values (true, :'owner'::uuid)
  on conflict (singleton) do update set user_id=excluded.user_id;
select dblink_connect('writer', 'dbname=' || current_database() || ' user=postgres');
select dblink_connect('reader', 'dbname=' || current_database() || ' user=postgres');
select dblink_exec('writer','set role authenticated');
select dblink_exec('reader','set role authenticated');
select dblink_exec('writer','set request.jwt.claim.role = ''authenticated''');
select dblink_exec('reader','set request.jwt.claim.role = ''authenticated''');
select dblink_exec('writer','set request.jwt.claim.sub = ''' || :'owner' || '''');
select dblink_exec('reader','set request.jwt.claim.sub = ''' || :'owner' || '''');

begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner',true);
select public.push_library_changes('{"protocol_version":1,"mutation_id":"ordering-first","changes":[{"kind":"shopping","entity_id":"ordering-one","base_revision":null,"payload":{"id":"ordering-one","name":"One","created_at":"2026-09-25T00:00:00Z"},"deleted":false}]}'::jsonb);
-- This query reaches the owner head row but cannot pass its lock before COMMIT.
select dblink_send_query('writer', $$select public.push_library_changes('{"protocol_version":1,"mutation_id":"ordering-second","changes":[{"kind":"shopping","entity_id":"ordering-two","base_revision":null,"payload":{"id":"ordering-two","name":"Two","created_at":"2026-09-25T00:00:00Z"},"deleted":false}]}'::jsonb)$$);
select pg_sleep(0.25);
select 1 / case when dblink_is_busy('writer') = 1 then 1 else 0 end as second_writer_waits;
-- The separate reader cannot see the uncommitted first group or the blocked second.
select 1 / case when (select result from dblink('reader','select public.pull_library_changes(0,1)') as x(result jsonb))#>>'{batches}' = '[]'
  then 1 else 0 end as uncommitted_invisible;
commit;
select result as second_result from dblink_get_result('writer') as x(result jsonb);
-- A one-revision cursor cannot miss either commit, even when the first was held.
select 1 / case when (select result from dblink('reader','select public.pull_library_changes(0,1)') as x(result jsonb))#>>'{batches,0,revision}' = '1'
  then 1 else 0 end as first_page_ordered;
select 1 / case when (select result from dblink('reader','select public.pull_library_changes(1,1)') as x(result jsonb))#>>'{batches,0,revision}' = '2'
  then 1 else 0 end as second_page_ordered;
select dblink_disconnect('writer');
select dblink_disconnect('reader');
