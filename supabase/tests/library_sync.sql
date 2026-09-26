-- Run only on a disposable database with migrations 0001-0006 and two auth users.
\set disposable NO
\getenv disposable AAF_TEST_DISPOSABLE_PROJECT
select 1 / case when :'disposable' = 'YES' and current_database() not in ('postgres','aaf_full','aaf_upgrade') then 1 else 0 end;
\set owner NO
\set other NO
\getenv owner AAF_TEST_OWNER_ID
\getenv other AAF_TEST_OTHER_ID
select 1 / case when :'owner' <> :'other' and
  (select count(*) from auth.users where id in (:'owner'::uuid, :'other'::uuid)) = 2 then 1 else 0 end;
begin;
select set_config('app.test.owner', :'owner', true);
select set_config('app.test.other', :'other', true);
insert into app_private.import_owner(singleton,user_id) values (true, :'owner'::uuid)
  on conflict (singleton) do update set user_id=excluded.user_id;

-- Privileges and definer search paths are part of the browser boundary.
do $$ begin
  if has_table_privilege('authenticated','public.library_records','INSERT')
    or has_table_privilege('authenticated','public.library_records','UPDATE')
    or has_table_privilege('authenticated','public.library_records','DELETE')
    or has_table_privilege('anon','public.library_records','SELECT')
    or has_schema_privilege('authenticated','app_private','USAGE')
    or has_function_privilege('anon','public.push_library_changes(jsonb)','EXECUTE')
    or has_function_privilege('anon','public.pull_library_changes(bigint,integer)','EXECUTE')
    or not has_function_privilege('authenticated','public.push_library_changes(jsonb)','EXECUTE')
    or not has_function_privilege('authenticated','public.pull_library_changes(bigint,integer)','EXECUTE')
  then raise exception 'sync grants are unsafe'; end if;
  if (select proconfig from pg_proc where oid='public.push_library_changes(jsonb)'::regprocedure) <> array['search_path=""']
    or (select proconfig from pg_proc where oid='public.pull_library_changes(bigint,integer)'::regprocedure) <> array['search_path=""']
  then raise exception 'sync definer search paths are unsafe'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',current_setting('app.test.owner'),true);
do $$ declare r jsonb; p jsonb; begin
  p := jsonb_build_object('protocol_version',1,'mutation_id','create-a','owner_id',current_setting('app.test.other'),
    'changes',jsonb_build_array(jsonb_build_object('kind','shopping','entity_id','same','base_revision',null,
      'payload',jsonb_build_object('id','same','name','Eggs','created_at','2026-09-25T00:00:00Z'), 'deleted',false)));
  r := public.push_library_changes(p);
  if r->>'status' <> 'accepted' or r->>'revision' <> '1' or jsonb_array_length(r->'records') <> 1
    or (r#>>'{records,0,payload,name}') <> 'Eggs' then raise exception 'create result: %',r; end if;
  if public.push_library_changes(p) <> r then raise exception 'identical retry changed receipt'; end if;
  begin
    perform public.push_library_changes(jsonb_set(p,'{changes,0,payload,name}','"Milk"'));
    raise exception 'mutation id accepted different body';
  exception when others then
    if sqlerrm = 'mutation id accepted different body' then raise; end if;
  end;
  r := public.push_library_changes(jsonb_build_object('protocol_version',1,'mutation_id','stale-create',
    'changes',jsonb_build_array(jsonb_build_object('kind','shopping','entity_id','same','base_revision',null,
      'payload',jsonb_build_object('id','same','name','Milk','created_at','2026-09-25T00:00:00Z'),'deleted',false))));
  if r->>'status' <> 'conflict' or (r#>>'{records,0,revision}') <> '1' then raise exception 'stale create: %',r; end if;
  r := public.push_library_changes(jsonb_build_object('protocol_version',1,'mutation_id','unknown-update',
    'changes',jsonb_build_array(jsonb_build_object('kind','shopping','entity_id','missing','base_revision',3,
      'payload',jsonb_build_object('id','missing','name','Milk','created_at','2026-09-25T00:00:00Z'),'deleted',false))));
  if r->>'status' <> 'conflict' or r#>>'{records,0,absent}' <> 'true' then raise exception 'absence conflict: %',r; end if;
  r := public.push_library_changes(jsonb_build_object('protocol_version',1,'mutation_id','group-conflict',
    'changes',jsonb_build_array(
      jsonb_build_object('kind','shopping','entity_id','new','base_revision',null,
        'payload',jsonb_build_object('id','new','name','New','created_at','2026-09-25T00:00:00Z'),'deleted',false),
      jsonb_build_object('kind','shopping','entity_id','same','base_revision',null,
        'payload',jsonb_build_object('id','same','name','Wrong','created_at','2026-09-25T00:00:00Z'),'deleted',false))));
  if r->>'status' <> 'conflict' or jsonb_array_length(r->'records') <> 1 then raise exception 'group conflict: %',r; end if;
  if exists(select 1 from public.library_records where entity_id='new') then raise exception 'group partially wrote'; end if;
  r := public.push_library_changes(jsonb_build_object('protocol_version',1,'mutation_id','update-delete',
    'changes',jsonb_build_array(
      jsonb_build_object('kind','shopping','entity_id','same','base_revision',1,
        'payload',jsonb_build_object('id','same','name','Milk','created_at','2026-09-25T00:00:00Z'),'deleted',false),
      jsonb_build_object('kind','pantry','entity_id','pantry-one','base_revision',null,
        'payload',jsonb_build_object('id','pantry-one','name','Flour','status','in_stock','aisle','Pantry','aisle_overridden',false,
          'notes',null,'created_at','2026-09-25T00:00:00Z','updated_at','2026-09-25T00:00:00Z'),'deleted',false))));
  if r->>'status' <> 'accepted' or r->>'revision' <> '2' or jsonb_array_length(r->'records') <> 2 then raise exception 'group update: %',r; end if;
  r := public.push_library_changes(jsonb_build_object('protocol_version',1,'mutation_id','delete-a',
    'changes',jsonb_build_array(jsonb_build_object('kind','shopping','entity_id','same','base_revision',2,'payload',null,'deleted',true))));
  if r->>'status' <> 'accepted' or r#>>'{records,0,deleted}' <> 'true' then raise exception 'delete: %',r; end if;
  r := public.push_library_changes(jsonb_build_object('protocol_version',1,'mutation_id','stale-resurrect',
    'changes',jsonb_build_array(jsonb_build_object('kind','shopping','entity_id','same','base_revision',1,
      'payload',jsonb_build_object('id','same','name','Wrong','created_at','2026-09-25T00:00:00Z'),'deleted',false))));
  if r->>'status' <> 'conflict' or r#>>'{records,0,deleted}' <> 'true' then raise exception 'delete conflict: %',r; end if;
  r := public.pull_library_changes(0,1);
  if jsonb_array_length(r->'batches') <> 1 or r->>'next_revision' <> '1' or r->>'has_more' <> 'true'
    then raise exception 'first page: %',r; end if;
  r := public.pull_library_changes(1,1);
  if jsonb_array_length(r#>'{batches,0,records}') <> 2 or r->>'next_revision' <> '2' or r->>'has_more' <> 'true'
    then raise exception 'group page: %',r; end if;
  r := public.pull_library_changes(2,1);
  if r->>'next_revision' <> '3' or r->>'has_more' <> 'false' then raise exception 'last page: %',r; end if;
  -- Immutable journal keeps the original payload after a later update and delete.
  if (public.pull_library_changes(0,1)#>>'{batches,0,records,0,payload,name}') <> 'Eggs'
    then raise exception 'earlier journal batch changed'; end if;
  begin perform public.pull_library_changes(0,0); raise exception 'zero page accepted';
  exception when others then if sqlerrm='zero page accepted' then raise; end if; end;
  begin perform public.pull_library_changes(0,51); raise exception 'large page accepted';
  exception when others then if sqlerrm='large page accepted' then raise; end if; end;
  begin
    perform public.push_library_changes(jsonb_build_object('protocol_version',1,'mutation_id','too-large',
      'changes',jsonb_build_array(jsonb_build_object('kind','shopping','entity_id','huge','base_revision',null,
        'payload',jsonb_build_object('id','huge','name',repeat('x',1048576),'created_at','2026-09-25T00:00:00Z'),'deleted',false))));
    raise exception 'oversize group accepted';
  exception when others then if sqlerrm='oversize group accepted' then raise; end if; end;
  begin
    perform public.push_library_changes('{"protocol_version":1,"mutation_id":"missing-kind","changes":[{"entity_id":"bad","base_revision":null,"payload":{"id":"bad","name":"X"},"deleted":false}]}'::jsonb);
    raise exception 'missing kind accepted';
  exception when others then if sqlerrm='missing kind accepted' then raise; end if; end;
  begin
    perform public.push_library_changes('{"protocol_version":1,"mutation_id":"missing-id","changes":[{"kind":"shopping","base_revision":null,"payload":{"id":"bad","name":"X"},"deleted":false}]}'::jsonb);
    raise exception 'missing entity id accepted';
  exception when others then if sqlerrm='missing entity id accepted' then raise; end if; end;
  begin
    perform public.push_library_changes('{"protocol_version":1,"mutation_id":"wrong-name-type","changes":[{"kind":"shopping","entity_id":"number-name","base_revision":null,"payload":{"id":"number-name","name":42,"created_at":"2026-09-25T00:00:00Z"},"deleted":false}]}'::jsonb);
    raise exception 'numeric shopping name accepted';
  exception when others then if sqlerrm='numeric shopping name accepted' then raise; end if; end;
  begin
    perform public.push_library_changes('{"protocol_version":1,"mutation_id":"bad","changes":[{"kind":"shopping","entity_id":"bad","base_revision":null,"payload":{"id":"wrong","name":"X"},"deleted":false}]}'::jsonb);
    raise exception 'bad payload accepted';
  exception when others then if sqlerrm='bad payload accepted' then raise; end if; end;
end $$;
do $$ declare recipe jsonb; r jsonb; bad jsonb; item jsonb; begin
  recipe := jsonb_build_object('id','recipe-one','title','Soup','description',null,'source_url',null,
    'source_attribution',null,'prep_time_min',null,'cook_time_min',null,'total_time_min',null,
    'servings',null,'yield_text',null,'ingredients',jsonb_build_array(jsonb_build_object('name','Water',
      'quantity',jsonb_build_object('value',1,'unit','cup','as_written','1 cup'),
      'preparation',null,'optional',false,'group',null,'notes',null)),
    'steps',jsonb_build_array(jsonb_build_object('order',1,'instruction','Boil','duration_min',null,
      'temperature_f',null,'equipment',jsonb_build_array(),'inline_amounts',jsonb_build_array())),
    'equipment',jsonb_build_array(),'cuisine',null,'course',null,'dietary_tags',jsonb_build_array(),
    'difficulty',null,'nutrition',null,'notes',null,'storage_instructions',null,
    'created_at','2026-09-25T00:00:00Z','times_made',0,'parse_confidence',null);
  -- Every rejected shape would be stored in the immutable journal if push accepts it.
  bad := jsonb_build_array(
    jsonb_build_object('kind','recipe','payload',jsonb_set(recipe,'{nutrition}','{}')),
    jsonb_build_object('kind','recipe','payload',jsonb_set(recipe,'{equipment}','[42]')),
    jsonb_build_object('kind','recipe','payload',jsonb_set(recipe,'{dietary_tags}','[42]')),
    jsonb_build_object('kind','recipe','payload',jsonb_set(recipe,'{ingredients,0,quantity,unit}','42')),
    jsonb_build_object('kind','recipe','payload',jsonb_set(recipe,'{steps,0,equipment}','[42]')),
    jsonb_build_object('kind','recipe','payload',jsonb_set(recipe,'{prep_time_min}','1.5')),
    jsonb_build_object('kind','recipe','payload',jsonb_set(recipe,'{difficulty}','"null"')),
    jsonb_build_object('kind','shopping','entity_id','42','payload','{"id":42,"name":"X","created_at":"now"}'::jsonb),
    jsonb_build_object('kind','shopping','payload','{"id":"bad","name":"X","created_at":"now","quantity_text":42}'::jsonb),
    jsonb_build_object('kind','shopping','payload','{"id":"bad","name":"X","created_at":"now","source":null}'::jsonb),
    jsonb_build_object('kind','shopping','payload','{"id":"bad","name":"X","created_at":"now","pantry_low":null}'::jsonb),
    jsonb_build_object('kind','shopping','payload','{"id":"bad","name":"X","created_at":"now","generated_week_of":5}'::jsonb),
    jsonb_build_object('kind','shopping','payload','{"id":"bad","name":"X"}'::jsonb),
    jsonb_build_object('kind','pantry','payload','{"id":"bad","name":"X","created_at":"now","updated_at":"now","notes":42}'::jsonb),
    jsonb_build_object('kind','planned_meal','payload','{"id":"bad","week_of":"2026-09-21","day_index":1,"recipe_id":42,"servings":2,"position":0}'::jsonb),
    jsonb_build_object('kind','planned_meal','payload','{"id":"bad","week_of":"2026-09-21","day_index":1.5,"recipe_id":"r","servings":2,"position":0}'::jsonb),
    jsonb_build_object('kind','cook_session','payload','{"id":"bad","session_id":"bad","recipe_id":42,"started_at":"now","step":0,"layout":"step","timer_end_at":null,"paused_seconds":null}'::jsonb),
    jsonb_build_object('kind','cook_session','payload','{"id":"bad","session_id":"bad","recipe_id":"r","started_at":"now","step":0,"layout":"step","timer_end_at":null,"paused_seconds":null,"completed_at":42}'::jsonb),
    jsonb_build_object('kind','draft','payload',jsonb_build_object('id','bad','recipe',recipe,'warnings',jsonb_build_array(42),'received_at','now')));
  for item in select value from jsonb_array_elements(bad) loop
    begin
      perform public.push_library_changes(jsonb_build_object('protocol_version',1,'mutation_id','invalid-shape',
        'changes',jsonb_build_array(jsonb_build_object('kind',item->>'kind',
          'entity_id',coalesce(item->>'entity_id',case when item->>'kind'='recipe' then 'recipe-one' else 'bad' end),
          'base_revision',null,'payload',item->'payload','deleted',false))));
      raise exception 'client-invalid payload accepted: %', item;
    exception when others then
      if sqlstate <> '22023' or sqlerrm <> 'invalid library change' then raise; end if;
    end;
  end loop;
  r := public.push_library_changes(jsonb_build_object('protocol_version',1,'mutation_id','all-kinds',
    'changes',jsonb_build_array(
      jsonb_build_object('kind','recipe','entity_id','recipe-one','base_revision',null,'payload',recipe,'deleted',false),
      jsonb_build_object('kind','draft','entity_id','draft-one','base_revision',null,
        'payload',jsonb_build_object('id','draft-one','recipe',recipe,'warnings',jsonb_build_array(),
          'received_at','2026-09-25T00:00:00Z'),'deleted',false),
      jsonb_build_object('kind','planned_meal','entity_id','meal-one','base_revision',null,
        'payload',jsonb_build_object('id','meal-one','week_of','2026-09-21','day_index',1,
          'recipe_id','recipe-one','servings',2,'position',0),'deleted',false),
      jsonb_build_object('kind','cook_session','entity_id','session-one','base_revision',null,
        'payload',jsonb_build_object('id','session-one','session_id','session-one','recipe_id','recipe-one',
          'started_at','2026-09-25T00:00:00Z','step',0,'layout','step','timer_end_at',null,
          'paused_seconds',null),'deleted',false))));
  if r->>'status' <> 'accepted' or jsonb_array_length(r->'records') <> 4
    then raise exception 'all kinds group: %',r; end if;
  recipe := jsonb_set(recipe,'{nutrition}',
    '{"kcal":null,"protein_g":null,"carbs_g":null,"fat_g":null,"fiber_g":null,"sugar_g":null,"sodium_mg":null}'::jsonb);
  r := public.push_library_changes(jsonb_build_object('protocol_version',1,'mutation_id','valid-defaults',
    'changes',jsonb_build_array(
      jsonb_build_object('kind','recipe','entity_id','recipe-one','base_revision',4,'payload',recipe,'deleted',false),
      jsonb_build_object('kind','pantry','entity_id','pantry-defaults','base_revision',null,
        'payload',jsonb_build_object('id','pantry-defaults','name','Rice',
          'created_at','2026-09-25T00:00:00Z','updated_at','2026-09-25T00:00:00Z'),'deleted',false))));
  if r->>'status' <> 'accepted' or jsonb_array_length(r->'records') <> 2
    then raise exception 'valid defaults/nutrition group: %',r; end if;
end $$;
reset role;

-- Current projection is owner gated, even when IDs collide.
do $$ begin
  if (select owner_id from public.library_records where entity_id='same') <> current_setting('app.test.owner')::uuid
  then raise exception 'request owner escaped auth boundary'; end if;
end $$;
update app_private.import_owner set user_id=current_setting('app.test.other')::uuid where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.test.other'),true);
do $$ declare r jsonb; begin
  r := public.pull_library_changes(0,10);
  if jsonb_array_length(r->'batches') <> 0 then raise exception 'other saw owner journal'; end if;
  if exists(select 1 from public.library_records) then raise exception 'other saw owner projection'; end if;
  r := public.push_library_changes('{"protocol_version":1,"mutation_id":"other-create","changes":[{"kind":"shopping","entity_id":"same","base_revision":null,"payload":{"id":"same","name":"Other","created_at":"2026-09-25T00:00:00Z"},"deleted":false}]}'::jsonb);
  if r->>'status' <> 'accepted' or r->>'revision' <> '1' then raise exception 'same ID under other: %',r; end if;
end $$;
reset role;
update app_private.import_owner set user_id=current_setting('app.test.owner')::uuid where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.test.other'),true);
do $$ begin
  begin perform public.pull_library_changes(); raise exception 'non-owner pulled';
  exception when others then if sqlerrm='non-owner pulled' then raise; end if; end;
  begin perform public.push_library_changes('{}'); raise exception 'non-owner pushed';
  exception when others then if sqlerrm='non-owner pushed' then raise; end if; end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin perform 1 from public.library_records; raise exception 'anon read projection';
  exception when insufficient_privilege then null; end;
  begin perform public.pull_library_changes(); raise exception 'anon called pull';
  exception when insufficient_privilege then null; end;
  begin perform public.push_library_changes('{}'); raise exception 'anon called push';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
