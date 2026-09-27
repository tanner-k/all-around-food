-- Only the task-owned disposable database; no hosted project or source template.
\set disposable NO
\getenv disposable AAF_TEST_DISPOSABLE_PROJECT
select 1 / case when :'disposable' = 'YES' and current_database() = 'aaf_sync_task1' then 1 else 0 end;
\set owner NO
\getenv owner AAF_TEST_OWNER_ID
begin;
select set_config('app.test.owner', :'owner', true);
insert into app_private.import_owner(singleton,user_id) values(true, :'owner'::uuid)
  on conflict(singleton) do update set user_id=excluded.user_id;
select set_config('app.test.recipe', $recipe${"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","title":"Toast","description":null,"source_url":null,"source_attribution":null,"prep_time_min":null,"cook_time_min":null,"total_time_min":null,"servings":1,"yield_text":null,"ingredients":[{"name":"bread","quantity":{"value":1,"unit":"slice","as_written":"1 slice"},"preparation":null,"optional":false,"group":null,"notes":null}],"steps":[{"order":1,"instruction":"Toast.","duration_min":null,"temperature_f":null}],"cuisine":null,"course":null,"difficulty":null,"nutrition":null,"notes":null,"storage_instructions":null,"parse_confidence":null,"created_at":"2026-09-25T00:00:00Z"}$recipe$, true);
insert into public.parse_jobs(id,user_id,kind,status,claim_token,lease_until,storage_path)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', :'owner'::uuid, 'screenshot','processing',
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',clock_timestamp()+interval '1 minute',:'owner' || '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.finish_import_job('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  current_setting('app.test.recipe')::jsonb,'["Check servings"]');
reset role;
do $$ begin
  if not exists(select 1 from public.parse_jobs where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and status='done')
    or not exists(select 1 from public.library_records where kind='draft' and entity_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and payload#>>'{warnings,0}'='Check servings' and revision=1)
    or not exists(select 1 from app_private.library_change_batches where revision=1 and records#>>'{0,kind}'='draft')
  then raise exception 'finish did not atomically publish the shared draft'; end if;
end $$;
-- Phone downloads the draft, then saves one conditional recipe/tombstone group.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',current_setting('app.test.owner'),true);
do $$ declare result jsonb; begin
  result := public.pull_library_changes(0,1);
  if result#>>'{batches,0,records,0,payload,warnings,0}' <> 'Check servings' then raise exception 'phone missed draft'; end if;
  result := public.push_library_changes(jsonb_build_object('protocol_version',1,'mutation_id','phone-save','changes',jsonb_build_array(
    jsonb_build_object('kind','recipe','entity_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','base_revision',null,
      'payload',current_setting('app.test.recipe')::jsonb,'deleted',false),
    jsonb_build_object('kind','draft','entity_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','base_revision',1,'payload',null,'deleted',true))));
  if result->>'status' <> 'accepted' or jsonb_array_length(result->'records') <> 2 then raise exception 'phone save failed: %',result; end if;
  perform public.ack_import_job('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select * from public.cleanup_import_jobs();
select public.forget_import_storage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',current_setting('app.test.owner') || '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png');
reset role;
do $$ begin
  if (select result_recipe_json from public.parse_jobs where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is not null
    or not exists(select 1 from public.library_records where kind='recipe' and not deleted and entity_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    or not exists(select 1 from public.library_records where kind='draft' and deleted and entity_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  then raise exception 'cleanup damaged shared save'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $$ declare result jsonb; begin
  result := public.pull_library_changes(0,50);
  if result#>>'{batches,1,records,0,kind}' <> 'recipe' or result#>>'{batches,1,records,1,deleted}' <> 'true'
    then raise exception 'fresh third device missed durable recipe'; end if;
end $$;
reset role;
-- Still-present legacy results backfill; invalid/cleaned rows are not fabricated.
insert into public.parse_jobs(id,user_id,kind,status,result_recipe_json,result_warnings,expires_at) values
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', :'owner'::uuid,'text','done',
  jsonb_set(current_setting('app.test.recipe')::jsonb,'{id}','"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"'),'["Legacy warning"]',clock_timestamp()+interval '1 day'),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc', :'owner'::uuid,'text','done','{}','[]',clock_timestamp()-interval '1 day'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd', :'owner'::uuid,'text','done',null,'[]',clock_timestamp()+interval '1 day');
-- Reintroduce a late result for the already saved/tombstoned draft.
update public.parse_jobs set result_recipe_json=current_setting('app.test.recipe')::jsonb
  where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare result jsonb; begin
  result := public.backfill_import_drafts();
  if result->>'published' <> '1' or jsonb_array_length(result->'invalid') <> 1
    or result#>>'{invalid,0,id}' <> 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    then raise exception 'unsafe backfill report: %',result; end if;
  perform public.backfill_import_drafts(); -- idempotent, preserves reviewed/deleted rows
  perform public.cleanup_import_jobs();
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.library_records where kind='draft' and entity_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      and payload#>>'{warnings,0}'='Legacy warning')
    or exists(select 1 from public.library_records where entity_id in ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd'))
    or not exists(select 1 from public.parse_jobs where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and result_recipe_json='{}'::jsonb and status='done')
    or not exists(select 1 from public.library_records where kind='draft' and entity_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and deleted)
  then raise exception 'backfill overwrote data or cleanup destroyed invalid result'; end if;
end $$;
-- Full codec validation and expired-token fencing leave both job and library untouched.
insert into public.parse_jobs(id,user_id,kind,status,claim_token,lease_until) values
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', :'owner'::uuid,'text','processing','eeeeeeee-1111-4111-8111-eeeeeeeeeeee',clock_timestamp()+interval '1 minute'),
('ffffffff-ffff-4fff-8fff-ffffffffffff', :'owner'::uuid,'text','processing','ffffffff-1111-4111-8111-ffffffffffff',clock_timestamp()-interval '1 second');
insert into public.parse_jobs(id,user_id,kind,status,lease_until)
values('99999999-9999-4999-8999-999999999999', :'owner'::uuid,'text','processing',clock_timestamp()+interval '1 minute');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ begin
  begin
    perform public.finish_import_job('99999999-9999-4999-8999-999999999999',null,
      jsonb_set(current_setting('app.test.recipe')::jsonb,'{id}','"99999999-9999-4999-8999-999999999999"'),'[]');
    raise exception 'null claim published';
  exception when others then if sqlerrm <> 'import claim lost' then raise; end if; end;
  begin
    perform public.finish_import_job('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-1111-4111-8111-eeeeeeeeeeee',
      jsonb_set(current_setting('app.test.recipe')::jsonb,'{id}','"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"') || '{"nutrition":{}}','[]');
    raise exception 'invalid codec result published';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.finish_import_job('ffffffff-ffff-4fff-8fff-ffffffffffff','ffffffff-1111-4111-8111-ffffffffffff',
      jsonb_set(current_setting('app.test.recipe')::jsonb,'{id}','"ffffffff-ffff-4fff-8fff-ffffffffffff"'),'[]');
    raise exception 'expired claim published';
  exception when others then if sqlerrm <> 'import claim lost' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.library_records where entity_id in ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','ffffffff-ffff-4fff-8fff-ffffffffffff'))
    or exists(select 1 from public.parse_jobs where id in ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','ffffffff-ffff-4fff-8fff-ffffffffffff') and status <> 'processing')
    then raise exception 'failed finish partially committed'; end if;
  if has_function_privilege('authenticated','public.backfill_import_drafts()','EXECUTE')
    or has_function_privilege('anon','public.backfill_import_drafts()','EXECUTE')
    then raise exception 'browser can backfill'; end if;
end $$;
rollback;
