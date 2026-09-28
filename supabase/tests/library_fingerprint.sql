-- Disposable-only regression for the pgcrypto extension-schema mismatch.
\set disposable NO
\getenv disposable AAF_TEST_DISPOSABLE_PROJECT
select 1 / case when :'disposable' = 'YES'
  and current_database() not in ('postgres','aaf_full','aaf_upgrade') then 1 else 0 end;
\set owner NO
\set other NO
\getenv owner AAF_TEST_OWNER_ID
\getenv other AAF_TEST_OTHER_ID
select 1 / case when :'owner' <> :'other' and
  (select count(*) from auth.users where id in (:'owner'::uuid, :'other'::uuid)) = 2 then 1 else 0 end;

begin;
select set_config('app.test.owner',:'owner',true);
insert into app_private.import_owner(singleton,user_id) values (true, :'owner'::uuid)
  on conflict (singleton) do update set user_id=excluded.user_id;
do $$ begin
  if to_regprocedure('extensions.digest(text,text)') is null
    or to_regprocedure('public.digest(text,text)') is not null
  then raise exception 'fixture must put pgcrypto outside public'; end if;
  if (select proconfig from pg_proc where oid='public.push_library_changes(jsonb)'::regprocedure)
    <> array['search_path=""']
    or has_function_privilege('anon','public.push_library_changes(jsonb)','execute')
    or not has_function_privilege('authenticated','public.push_library_changes(jsonb)','execute')
    or has_table_privilege('authenticated','public.library_records','insert')
  then raise exception 'push security boundary changed'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner',true);
do $$ declare p jsonb; r jsonb; begin
  p := jsonb_build_object('protocol_version',1,'mutation_id','fingerprint-unicode',
    'changes',jsonb_build_array(jsonb_build_object('kind','shopping','entity_id','utf8-recipe',
      'base_revision',null,'payload',jsonb_build_object('id','utf8-recipe',
      'name',U&'Cr\00E8me br\00FBl\00E9e \\ caf\00E9','created_at','2026-09-27T00:00:00Z'),
      'deleted',false)));
  r := public.push_library_changes(p);
  if r->>'status' <> 'accepted' or r->>'revision' <> '1' then
    raise exception 'authenticated create failed'; end if;
  if public.pull_library_changes(0,10)#>>'{batches,0,records,0,payload,name}'
    <> U&'Cr\00E8me br\00FBl\00E9e \\ caf\00E9' then
    raise exception 'pull changed Unicode/backslash payload'; end if;
  perform set_config('app.test.request',p::text,true);
  perform set_config('app.test.result',r::text,true);
end $$;
reset role;

-- Only the test administrator can inspect a private receipt; the browser cannot.
do $$ declare p jsonb := current_setting('app.test.request')::jsonb;
  old_hash bytea; stored_hash bytea; begin
  select request_fingerprint into stored_hash from app_private.library_mutation_receipts
    where owner_id=current_setting('app.test.owner')::uuid and mutation_id='fingerprint-unicode';
  old_hash := extensions.digest(p::text,'sha256');
  if stored_hash <> old_hash or octet_length(stored_hash) <> 32 then
    raise exception 'fingerprint differs from existing SHA256 receipts'; end if;
  -- Simulate a pre-migration receipt made with pgcrypto, then retry its request.
  update app_private.library_mutation_receipts set request_fingerprint=old_hash
    where owner_id=current_setting('app.test.owner')::uuid and mutation_id='fingerprint-unicode';
end $$;
set local role authenticated;
do $$ declare p jsonb := current_setting('app.test.request')::jsonb;
  r jsonb := current_setting('app.test.result')::jsonb; begin
  if public.push_library_changes(p) <> r then raise exception 'old receipt replay changed'; end if;
  begin
    perform public.push_library_changes(jsonb_set(p,'{changes,0,payload,name}','"different"'));
    raise exception 'different body accepted with reused mutation id';
  exception when invalid_parameter_value then
    if sqlerrm <> 'mutation id reused with different request' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.library_records where owner_id=current_setting('app.test.owner')::uuid) <> 1
    or (select count(*) from app_private.library_change_batches where owner_id=current_setting('app.test.owner')::uuid) <> 1
  then raise exception 'replay or rejection duplicated a record'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub',:'other',true);
do $$ begin
  begin
    perform public.push_library_changes('{"protocol_version":1,"mutation_id":"foreign","changes":[]}'::jsonb);
    raise exception 'foreign owner pushed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin
    perform public.push_library_changes('{}'::jsonb);
    raise exception 'anonymous caller pushed';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
