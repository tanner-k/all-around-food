-- Run only against a disposable Supabase database with migrations 0001-0004.
-- Requires AAF_TEST_DISPOSABLE_PROJECT=YES, AAF_TEST_OWNER_ID and
-- AAF_TEST_OTHER_ID (two actual auth.users in that disposable project).
\set disposable NO
\getenv disposable AAF_TEST_DISPOSABLE_PROJECT
select 1 / case when :'disposable' = 'YES' then 1 else 0 end as disposable_project_guard;
\set owner NO
\set other NO
\getenv owner AAF_TEST_OWNER_ID
\getenv other AAF_TEST_OTHER_ID
select 1 / case when :'owner' <> :'other' and
  (select count(*) from auth.users where id in (:'owner'::uuid, :'other'::uuid)) = 2
  then 1 else 0 end as test_accounts_guard;
select set_config('app.test.owner', :'owner', false);
select set_config('app.test.other', :'other', false);
begin;
insert into app_private.import_owner(singleton,user_id)
values (true,current_setting('app.test.owner')::uuid)
on conflict (singleton) do update set user_id=excluded.user_id;

-- Owner can insert only permitted columns and read the row.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',current_setting('app.test.owner'),true);
insert into public.parse_jobs(id,kind,payload_text)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','text','eggs');
do $$ begin
  if (select count(*) from public.parse_jobs where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
  then raise exception 'owner cannot read own job'; end if;
  begin
    update public.parse_jobs set status='done', lease_until=now() where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'client changed state';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.parse_jobs(id,kind,result_recipe_json)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','text','{}');
    raise exception 'client wrote result';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_parse_jobs(1);
    raise exception 'client claimed job';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Another authenticated user sees no job and cannot mutate owner lifecycle.
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.test.other'),true);
do $$ begin
  if (select count(*) from public.parse_jobs where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 0
  then raise exception 'other user read owner job'; end if;
  begin
    insert into public.parse_jobs(id,kind,payload_text)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','text','other');
    raise exception 'other user inserted job';
  exception when insufficient_privilege or check_violation then null; end;
  begin
    perform public.ack_import_job('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    raise exception 'other user acknowledged job';
  exception when others then
    if sqlerrm = 'other user acknowledged job' then raise; end if;
  end;
end $$;
reset role;

-- Anonymous clients have no table read/insert or RPC claim rights.
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin
    perform 1 from public.parse_jobs;
    raise exception 'anonymous read jobs';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_parse_jobs(1);
    raise exception 'anonymous claimed job';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Service-role claim and token fencing, including expiry and attempt cap.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare j public.parse_jobs; old_token uuid;
begin
  select * into j from public.claim_parse_jobs(1);
  if j.id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' or j.attempts <> 1 or j.claim_token is null
  then raise exception 'service claim failed'; end if;
  old_token := j.claim_token;
  update public.parse_jobs set lease_until=now()-interval '1 second' where id=j.id;
  select * into j from public.claim_parse_jobs(1);
  if j.attempts <> 2 or j.claim_token = old_token then raise exception 'reclaim failed'; end if;
  begin
    perform public.finish_import_job(j.id,old_token,
      jsonb_build_object('id',j.id,'title','Toast','ingredients',jsonb_build_array(1),'steps',jsonb_build_array(1)),'[]');
    raise exception 'stale claim published';
  exception when others then
    if sqlerrm = 'stale claim published' then raise; end if;
  end;
  perform public.finish_import_job(j.id,j.claim_token,
    jsonb_build_object('id',j.id,'title','Toast','ingredients',jsonb_build_array(1),'steps',jsonb_build_array(1)),'["review"]');
  if (select status from public.parse_jobs where id=j.id) <> 'done'
  then raise exception 'finish failed'; end if;
end $$;
reset role;

-- Owner acknowledgement is idempotent and never accepts pending/error rows.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',current_setting('app.test.owner'),true);
do $$ declare first_ack timestamptz; begin
  perform public.ack_import_job('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  select acknowledged_at into first_ack from public.parse_jobs where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform public.ack_import_job('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  if (select acknowledged_at from public.parse_jobs where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> first_ack
  then raise exception 'ack changed timestamp'; end if;
end $$;
reset role;

-- A crashed third attempt becomes an owner-visible error instead of hanging.
insert into public.parse_jobs(id,user_id,kind,source_url)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  current_setting('app.test.owner')::uuid,'url','https://example.com');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare j public.parse_jobs; i int; begin
  for i in 1..3 loop
    select * into j from public.claim_parse_jobs(1);
    if j.id <> 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' or j.attempts <> i
    then raise exception 'claim attempt % failed',i; end if;
    update public.parse_jobs set lease_until=now()-interval '1 second' where id=j.id;
  end loop;
  perform public.claim_parse_jobs(1);
  if (select status from public.parse_jobs where id=j.id) <> 'error'
  then raise exception 'exhausted claim remained processing'; end if;
end $$;
reset role;

-- Failed images remain available while the owner can still retry them.
insert into public.parse_jobs(id,user_id,kind,storage_path)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  current_setting('app.test.owner')::uuid,'screenshot',
  current_setting('app.test.owner') || '/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare j public.parse_jobs; begin
  select * into j from public.claim_parse_jobs(1);
  if j.id <> 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' then
    raise exception 'image job was not claimed'; end if;
  perform public.fail_import_job(j.id,j.claim_token,'Image parse failed');
  if exists (select 1 from public.cleanup_import_jobs()
    where job_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd') then
    raise exception 'retryable image was queued for cleanup'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',current_setting('app.test.owner'),true);
do $$ declare j public.parse_jobs; begin
  select * into j from public.retry_import_job('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  if j.status <> 'pending' or j.storage_path is null then
    raise exception 'retry lost image payload'; end if;
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare j public.parse_jobs; i int; begin
  for i in 2..3 loop
    select * into j from public.claim_parse_jobs(1);
    if j.id <> 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' or j.attempts <> i then
      raise exception 'image retry attempt % failed',i; end if;
    perform public.fail_import_job(j.id,j.claim_token,'Image parse failed');
    if i < 3 then
      update public.parse_jobs set status='pending', error=null where id=j.id;
    end if;
  end loop;
  if not exists (select 1 from public.cleanup_import_jobs()
    where job_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd') then
    raise exception 'exhausted image was not queued for cleanup'; end if;
  perform public.forget_import_storage(j.id,j.storage_path);
  if (select storage_path from public.parse_jobs where id=j.id) is not null then
    raise exception 'exhausted image path was retained'; end if;
end $$;
reset role;

-- Expired payloads become visible tombstones; acknowledged draft JSON is wiped.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update public.parse_jobs set expires_at=now()-interval '1 second'
where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select * from public.cleanup_import_jobs();
do $$ begin
  if (select error from public.parse_jobs where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')
      <> 'Import expired; submit again'
  then raise exception 'expiry not visible'; end if;
  if (select result_recipe_json from public.parse_jobs
      where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is not null
  then raise exception 'acknowledged draft retained'; end if;
end $$;
reset role;
rollback;
