-- Two real SQL connections, exclusively in the documented task-owned fixture.
\set disposable NO
\getenv disposable AAF_TEST_DISPOSABLE_PROJECT
select 1 / case when :'disposable' = 'YES' and current_database() = 'aaf_sync_task1' then 1 else 0 end;
\set owner NO
\getenv owner AAF_TEST_OWNER_ID
create extension if not exists dblink;
insert into app_private.import_owner(singleton,user_id) values(true, :'owner'::uuid)
  on conflict(singleton) do update set user_id=excluded.user_id;
insert into app_private.library_sync_heads(owner_id) values(:'owner'::uuid) on conflict do nothing;
insert into public.parse_jobs(id,user_id,kind,status,claim_token,lease_until)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', :'owner'::uuid,'text','processing',
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',clock_timestamp()+interval '1.2 seconds');
select dblink_connect('worker','dbname=' || current_database() || ' user=postgres');
select dblink_exec('worker','set request.jwt.claim.role = ''service_role''');
begin;
select 1 from app_private.library_sync_heads where owner_id=:'owner'::uuid for update;
select dblink_send_query('worker',$query$do $lease$ begin
  perform public.finish_import_job(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  $recipe${"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","title":"Toast","description":null,"source_url":null,"source_attribution":null,"prep_time_min":null,"cook_time_min":null,"total_time_min":null,"servings":1,"yield_text":null,"ingredients":[{"name":"bread","quantity":{"value":1,"unit":"slice","as_written":"1 slice"},"preparation":null,"optional":false,"group":null,"notes":null}],"steps":[{"order":1,"instruction":"Toast.","duration_min":null,"temperature_f":null}],"cuisine":null,"course":null,"difficulty":null,"nutrition":null,"notes":null,"storage_instructions":null,"parse_confidence":null,"created_at":"2026-09-25T00:00:00Z"}$recipe$::jsonb,'["Lease check"]');
  raise exception 'expired publication accepted';
exception when others then if sqlerrm <> 'import claim lost' then raise; end if; end $lease$$query$);
select pg_sleep(0.2);
select 1 / case when dblink_is_busy('worker')=1 then 1 else 0 end as worker_waits_for_owner_head;
-- This succeeds NOWAIT while the worker waits: it has not taken the job lock first.
select id from public.parse_jobs where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' for update nowait;
select pg_sleep(1.2);
commit;
-- The remote block accepts only the expected fencing failure, without noisy errors.
select result from dblink_get_result('worker') as x(result text);
select 1 / case when not exists(select 1 from public.library_records where entity_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  and exists(select 1 from public.parse_jobs where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and status='processing')
  then 1 else 0 end as expired_after_lock_did_not_publish;
select dblink_disconnect('worker');
delete from public.parse_jobs where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
