-- Owner-scoped, revision-ordered library protocol. The journal is append-only;
-- current rows are a projection and must never be used to reconstruct old pages.
create table public.library_records (
  owner_id uuid not null,
  kind text not null check (kind in ('recipe','draft','planned_meal','shopping','pantry','cook_session')),
  entity_id text not null check (length(entity_id) between 1 and 256),
  schema_version int not null check (schema_version = 1),
  revision bigint not null check (revision > 0),
  payload jsonb,
  deleted boolean not null,
  updated_at timestamptz not null,
  primary key (owner_id,kind,entity_id),
  check ((deleted and payload is null) or (not deleted and jsonb_typeof(payload) = 'object'))
);
alter table public.library_records enable row level security;
-- Direct browser writes are forbidden even when RLS would permit the owner.
revoke all on public.library_records from public, anon, authenticated;
grant select on public.library_records to authenticated;
create policy "library owner read" on public.library_records for select to authenticated
  using (owner_id = auth.uid() and owner_id = public.import_owner_uid());

create table app_private.library_sync_heads (
  owner_id uuid primary key,
  revision bigint not null default 0 check (revision >= 0)
);
create table app_private.library_mutation_receipts (
  owner_id uuid not null,
  mutation_id text not null,
  request_fingerprint bytea not null,
  result jsonb not null,
  primary key (owner_id,mutation_id)
);
create table app_private.library_change_batches (
  owner_id uuid not null,
  revision bigint not null check (revision > 0),
  records jsonb not null check (jsonb_typeof(records) = 'array'),
  primary key (owner_id,revision)
);
revoke all on app_private.library_sync_heads, app_private.library_mutation_receipts,
  app_private.library_change_batches from public, anon, authenticated;

-- Server-side shape checks mirror the stable required fields in the local Zod
-- models. Additive migrations can extend this validator when models evolve.
create function app_private.valid_library_payload(p_kind text, p_id text, p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb;
begin
  if coalesce(jsonb_typeof(p),'') <> 'object' or coalesce(jsonb_typeof(p->'id'),'') <> 'string'
    or p->>'id' is distinct from p_id then return false; end if;
  if p_kind = 'recipe' then
    if not (p ?& array['description','source_url','source_attribution','prep_time_min',
      'cook_time_min','total_time_min','servings','yield_text','cuisine','course',
      'difficulty','nutrition','notes','storage_instructions','parse_confidence'])
      or coalesce(jsonb_typeof(p->'title'),'') <> 'string' or nullif(trim(p->>'title'),'') is null
      or coalesce(jsonb_typeof(p->'description'),'') not in ('string','null')
      or coalesce(jsonb_typeof(p->'source_url'),'') not in ('string','null')
      or coalesce(jsonb_typeof(p->'source_attribution'),'') not in ('string','null')
      or coalesce(jsonb_typeof(p->'prep_time_min'),'') not in ('number','null')
      or coalesce(jsonb_typeof(p->'cook_time_min'),'') not in ('number','null')
      or coalesce(jsonb_typeof(p->'total_time_min'),'') not in ('number','null')
      or coalesce(jsonb_typeof(p->'servings'),'') not in ('number','null')
      or coalesce(jsonb_typeof(p->'yield_text'),'') not in ('string','null')
      or coalesce(jsonb_typeof(p->'cuisine'),'') not in ('string','null')
      or coalesce(jsonb_typeof(p->'course'),'') not in ('string','null')
      or coalesce(p->>'difficulty','null') not in ('easy','medium','hard','null')
      or coalesce(jsonb_typeof(p->'nutrition'),'') not in ('object','null')
      or coalesce(jsonb_typeof(p->'notes'),'') not in ('string','null')
      or coalesce(jsonb_typeof(p->'storage_instructions'),'') not in ('string','null')
      or coalesce(jsonb_typeof(p->'parse_confidence'),'') not in ('number','null')
      or (p->'parse_confidence' <> 'null'::jsonb and (p->>'parse_confidence')::numeric not between 0 and 1)
      or (p ? 'times_made' and (coalesce(p->>'times_made','') !~ '^[0-9]+$'))
      or (p ? 'equipment' and coalesce(jsonb_typeof(p->'equipment'),'') <> 'array')
      or (p ? 'dietary_tags' and coalesce(jsonb_typeof(p->'dietary_tags'),'') <> 'array')
      or coalesce(jsonb_typeof(p->'ingredients'),'') <> 'array'
      or jsonb_array_length(p->'ingredients') = 0 or coalesce(jsonb_typeof(p->'steps'),'') <> 'array'
      or jsonb_array_length(p->'steps') = 0 or coalesce(jsonb_typeof(p->'created_at'),'') <> 'string'
    then return false; end if;
    for item in select value from jsonb_array_elements(p->'ingredients') loop
      if coalesce(jsonb_typeof(item),'') <> 'object'
        or not (item ?& array['preparation','group','notes'])
        or coalesce(jsonb_typeof(item->'name'),'') <> 'string'
        or nullif(trim(item->>'name'),'') is null
        or coalesce(jsonb_typeof(item->'quantity'),'') <> 'object'
        or coalesce(jsonb_typeof(item#>'{quantity,as_written}'),'') <> 'string'
        or not (item->'quantity' ?& array['value','unit'])
        or coalesce(jsonb_typeof(item#>'{quantity,value}'),'') not in ('number','null')
        or coalesce(jsonb_typeof(item#>'{quantity,unit}'),'') not in ('string','null')
        or coalesce(jsonb_typeof(item->'preparation'),'') not in ('string','null')
        or coalesce(jsonb_typeof(item->'group'),'') not in ('string','null')
        or coalesce(jsonb_typeof(item->'notes'),'') not in ('string','null')
        or (item ? 'optional' and coalesce(jsonb_typeof(item->'optional'),'') <> 'boolean')
        then return false; end if;
    end loop;
    for item in select value from jsonb_array_elements(p->'steps') loop
      if coalesce(jsonb_typeof(item),'') <> 'object'
        or not (item ?& array['duration_min','temperature_f'])
        or coalesce(item->>'order','') !~ '^[0-9]+$'
        or coalesce(jsonb_typeof(item->'instruction'),'') <> 'string'
        or coalesce(jsonb_typeof(item->'duration_min'),'') not in ('number','null')
        or coalesce(jsonb_typeof(item->'temperature_f'),'') not in ('number','null')
        or (item ? 'equipment' and coalesce(jsonb_typeof(item->'equipment'),'') <> 'array')
        or (item ? 'inline_amounts' and coalesce(jsonb_typeof(item->'inline_amounts'),'') <> 'array')
        then return false; end if;
    end loop;
  elsif p_kind = 'draft' then
    if coalesce(jsonb_typeof(p->'recipe'),'') <> 'object' or nullif(p->'recipe'->>'id','') is null
      or not app_private.valid_library_payload('recipe',p->'recipe'->>'id',p->'recipe')
      or coalesce(jsonb_typeof(p->'warnings'),'') <> 'array' or coalesce(jsonb_typeof(p->'received_at'),'') <> 'string'
    then return false; end if;
    for item in select value from jsonb_array_elements(p->'warnings') loop
      if coalesce(jsonb_typeof(item),'') <> 'string' then return false; end if;
    end loop;
  elsif p_kind = 'planned_meal' then
    if coalesce(jsonb_typeof(p->'week_of'),'') <> 'string' or (p->>'week_of') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(p->>'day_index','') !~ '^[0-6]$' or nullif(p->>'recipe_id','') is null
      or coalesce(p->>'position','') !~ '^[0-9]+$'
      or not p ? 'servings' or (p->'servings' <> 'null'::jsonb and
        (coalesce(jsonb_typeof(p->'servings'),'') <> 'number' or (p->>'servings')::numeric <= 0))
    then return false; end if;
  elsif p_kind = 'shopping' then
    if coalesce(jsonb_typeof(p->'name'),'') <> 'string' or nullif(trim(p->>'name'),'') is null
      or coalesce(jsonb_typeof(p->'created_at'),'') <> 'string'
      or (p ? 'checked' and coalesce(jsonb_typeof(p->'checked'),'') <> 'boolean')
      or (p ? 'source' and p->>'source' not in ('manual','recipe','planner'))
      or (p ? 'aisle' and p->>'aisle' not in
        ('Produce','Dairy','Meat','Bakery','Pantry','Frozen','Beverages','Household','Other'))
    then return false; end if;
  elsif p_kind = 'pantry' then
    if coalesce(jsonb_typeof(p->'name'),'') <> 'string' or nullif(trim(p->>'name'),'') is null
      or coalesce(p->>'status','') not in ('in_stock','low','out')
      or coalesce(p->>'aisle','') not in ('Produce','Dairy','Meat','Bakery','Pantry','Frozen','Beverages','Household','Other')
      or coalesce(jsonb_typeof(p->'aisle_overridden'),'') <> 'boolean'
      or coalesce(jsonb_typeof(p->'created_at'),'') <> 'string' or coalesce(jsonb_typeof(p->'updated_at'),'') <> 'string'
    then return false; end if;
  elsif p_kind = 'cook_session' then
    if nullif(p->>'session_id','') is null or p->>'session_id' is distinct from p_id
      or nullif(p->>'recipe_id','') is null or coalesce(jsonb_typeof(p->'started_at'),'') <> 'string'
      or coalesce(p->>'step','') !~ '^[0-9]+$' or coalesce(p->>'layout','') not in ('step','scroll')
      or not p ? 'timer_end_at' or not p ? 'paused_seconds'
      or (p->'timer_end_at' <> 'null'::jsonb and coalesce(jsonb_typeof(p->'timer_end_at'),'') <> 'number')
      or (p->'paused_seconds' <> 'null'::jsonb and coalesce(jsonb_typeof(p->'paused_seconds'),'') <> 'number')
    then return false; end if;
  else return false;
  end if;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
revoke all on function app_private.valid_library_payload(text,text,jsonb) from public, anon, authenticated;

create function public.push_library_changes(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_change jsonb;
  v_current public.library_records%rowtype;
  v_head bigint;
  v_revision bigint;
  v_fingerprint bytea;
  v_receipt app_private.library_mutation_receipts%rowtype;
  v_conflicts jsonb := '[]'::jsonb;
  v_records jsonb := '[]'::jsonb;
  v_result jsonb;
  v_when timestamptz := clock_timestamp();
  v_kind text;
  v_id text;
  v_base bigint;
  v_deleted boolean;
  v_payload jsonb;
  v_seen text[] := '{}'::text[];
  v_key text;
  v_mutation text;
begin
  if auth.role() <> 'authenticated' or v_owner is null or v_owner <> public.import_owner_uid()
  then raise exception 'not library owner' using errcode='42501'; end if;
  if coalesce(jsonb_typeof(p_request),'') <> 'object' or p_request->>'protocol_version' <> '1'
    or coalesce(jsonb_typeof(p_request->'protocol_version'),'') <> 'number'
    or coalesce(jsonb_typeof(p_request->'mutation_id'),'') <> 'string'
    or length(p_request->>'mutation_id') not between 1 and 128
    or coalesce(jsonb_typeof(p_request->'changes'),'') <> 'array'
    or jsonb_array_length(p_request->'changes') not between 1 and 100
    or octet_length(p_request::text) > 1048576
  then raise exception 'invalid library request' using errcode='22023'; end if;
  v_mutation := p_request->>'mutation_id';
  v_fingerprint := public.digest(p_request::text,'sha256');
  -- The head row is the per-owner commit lock. Receipt lookup is under it.
  insert into app_private.library_sync_heads(owner_id) values (v_owner) on conflict do nothing;
  select revision into v_head from app_private.library_sync_heads where owner_id=v_owner for update;
  select * into v_receipt from app_private.library_mutation_receipts
    where owner_id=v_owner and mutation_id=v_mutation;
  if found then
    if v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'mutation id reused with different request' using errcode='22023';
    end if;
    return v_receipt.result;
  end if;
  for v_change in select value from jsonb_array_elements(p_request->'changes') loop
    v_kind := v_change->>'kind';
    v_id := v_change->>'entity_id';
    v_deleted := (v_change->>'deleted')::boolean;
    v_payload := v_change->'payload';
    if coalesce(jsonb_typeof(v_change),'') <> 'object'
      or coalesce(jsonb_typeof(v_change->'kind'),'') <> 'string'
      or v_kind not in ('recipe','draft','planned_meal','shopping','pantry','cook_session')
      or coalesce(jsonb_typeof(v_change->'entity_id'),'') <> 'string' or length(v_id) not between 1 and 256
      or coalesce(jsonb_typeof(v_change->'deleted'),'') <> 'boolean'
      or not v_change ? 'base_revision' or not v_change ? 'payload'
      or (v_change->'base_revision' <> 'null'::jsonb and
        (coalesce(jsonb_typeof(v_change->'base_revision'),'') <> 'number' or (v_change->>'base_revision') !~ '^[1-9][0-9]*$'))
      or (v_deleted and v_payload <> 'null'::jsonb)
      or (not v_deleted and not app_private.valid_library_payload(v_kind,v_id,v_payload))
    then raise exception 'invalid library change' using errcode='22023'; end if;
    v_key := v_kind || ':' || v_id;
    if v_key = any(v_seen) then raise exception 'duplicate target in library group' using errcode='22023'; end if;
    v_seen := array_append(v_seen,v_key);
    v_base := case when v_change->'base_revision' = 'null'::jsonb then null
      else (v_change->>'base_revision')::bigint end;
    select * into v_current from public.library_records where owner_id=v_owner and kind=v_kind and entity_id=v_id;
    if (v_base is null and (found or v_deleted)) or (v_base is not null and
      (not found or v_current.revision <> v_base)) then
      v_conflicts := v_conflicts || jsonb_build_array(case when found then
        jsonb_build_object('kind',v_current.kind,'entity_id',v_current.entity_id,
          'schema_version',v_current.schema_version,'revision',v_current.revision,
          'payload',v_current.payload,'deleted',v_current.deleted,'updated_at',v_current.updated_at)
        else jsonb_build_object('kind',v_kind,'entity_id',v_id,'absent',true) end);
    end if;
  end loop;
  if jsonb_array_length(v_conflicts) > 0 then
    return jsonb_build_object('status','conflict','records',v_conflicts);
  end if;
  v_revision := v_head + 1;
  for v_change in select value from jsonb_array_elements(p_request->'changes') loop
    v_kind := v_change->>'kind'; v_id := v_change->>'entity_id';
    v_deleted := (v_change->>'deleted')::boolean; v_payload := v_change->'payload';
    insert into public.library_records(owner_id,kind,entity_id,schema_version,revision,payload,deleted,updated_at)
    values(v_owner,v_kind,v_id,1,v_revision,case when v_deleted then null else v_payload end,v_deleted,v_when)
    on conflict(owner_id,kind,entity_id) do update set schema_version=excluded.schema_version,
      revision=excluded.revision,payload=excluded.payload,deleted=excluded.deleted,updated_at=excluded.updated_at;
    v_records := v_records || jsonb_build_array(jsonb_build_object('kind',v_kind,'entity_id',v_id,
      'schema_version',1,'revision',v_revision,'payload',case when v_deleted then null else v_payload end,
      'deleted',v_deleted,'updated_at',v_when));
  end loop;
  insert into app_private.library_change_batches(owner_id,revision,records) values(v_owner,v_revision,v_records);
  update app_private.library_sync_heads set revision=v_revision where owner_id=v_owner;
  v_result := jsonb_build_object('status','accepted','revision',v_revision,'records',v_records);
  insert into app_private.library_mutation_receipts(owner_id,mutation_id,request_fingerprint,result)
    values(v_owner,v_mutation,v_fingerprint,v_result);
  return v_result;
end $$;
revoke all on function public.push_library_changes(jsonb) from public, anon;
grant execute on function public.push_library_changes(jsonb) to authenticated;

create function public.pull_library_changes(p_after_revision bigint default 0, p_max_revisions int default 10)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_result jsonb;
begin
  if auth.role() <> 'authenticated' or v_owner is null or v_owner <> public.import_owner_uid()
  then raise exception 'not library owner' using errcode='42501'; end if;
  if p_after_revision is null or p_after_revision < 0 or p_max_revisions is null
    or p_max_revisions not between 1 and 50
  then raise exception 'invalid library cursor' using errcode='22023'; end if;
  -- This single statement observes one MVCC snapshot, including the next-page bit.
  with page as materialized (
    select revision,records from app_private.library_change_batches
    where owner_id=v_owner and revision > p_after_revision order by revision limit p_max_revisions
  ), boundary as (
    select coalesce(max(revision),p_after_revision) as next_revision from page
  )
  select jsonb_build_object('protocol_version',1,
    'batches',coalesce((select jsonb_agg(jsonb_build_object('revision',revision,'records',records) order by revision) from page),'[]'::jsonb),
    'next_revision',boundary.next_revision,
    'has_more',exists(select 1 from app_private.library_change_batches
      where owner_id=v_owner and revision > boundary.next_revision))
  into v_result from boundary;
  return v_result;
end $$;
revoke all on function public.pull_library_changes(bigint,int) from public, anon;
grant execute on function public.pull_library_changes(bigint,int) to authenticated;
