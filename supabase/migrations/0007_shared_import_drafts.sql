-- Import results become durable library drafts in the worker's finish transaction.
-- All publication callers lock owner head BEFORE job row; browser writers use
-- that same head. Temporary queue cleanup never mutates the shared library.
create function app_private.publish_import_draft_locked(
  p_owner uuid, p_id text, p_recipe jsonb, p_warnings jsonb, p_received_at timestamptz)
returns boolean language plpgsql set search_path = '' as $$
declare v_payload jsonb; v_revision bigint; v_records jsonb;
begin
  v_payload := jsonb_build_object('id',p_id,'recipe',p_recipe,'warnings',p_warnings,'received_at',p_received_at);
  if p_recipe->>'id' is distinct from p_id
    or not app_private.valid_library_payload('draft',p_id,v_payload)
    or octet_length(v_payload::text) > 1048576
  then raise exception 'invalid shared import draft' using errcode='22023'; end if;
  -- Reviewed drafts, tombstones, and any saved/deleted recipe always win.
  if exists(select 1 from public.library_records where owner_id=p_owner
    and entity_id=p_id and kind in ('draft','recipe')) then return false; end if;
  select revision+1 into strict v_revision from app_private.library_sync_heads where owner_id=p_owner;
  insert into public.library_records(owner_id,kind,entity_id,schema_version,revision,payload,deleted,updated_at)
    values(p_owner,'draft',p_id,1,v_revision,v_payload,false,p_received_at);
  v_records := jsonb_build_array(jsonb_build_object('kind','draft','entity_id',p_id,'schema_version',1,
    'revision',v_revision,'payload',v_payload,'deleted',false,'updated_at',p_received_at));
  insert into app_private.library_change_batches(owner_id,revision,records) values(p_owner,v_revision,v_records);
  update app_private.library_sync_heads set revision=v_revision where owner_id=p_owner;
  return true;
end $$;
revoke all on function app_private.publish_import_draft_locked(uuid,text,jsonb,jsonb,timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.finish_import_job(
  p_id text, p_claim_token uuid, p_recipe jsonb, p_warnings jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := public.import_owner_uid(); v_job public.parse_jobs; v_when timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if v_owner is null then raise exception 'import claim lost'; end if;
  insert into app_private.library_sync_heads(owner_id) values(v_owner) on conflict do nothing;
  perform 1 from app_private.library_sync_heads where owner_id=v_owner for update;
  select * into v_job from public.parse_jobs where id=p_id and user_id=v_owner for update;
  -- clock_timestamp is checked AFTER waiting for both locks, not transaction now().
  v_when := clock_timestamp();
  if not found or v_job.status <> 'processing' or p_claim_token is null
    or v_job.claim_token is null or v_job.claim_token is distinct from p_claim_token
    or v_job.lease_until is null or v_job.lease_until <= v_when
    or v_job.expires_at <= v_when then raise exception 'import claim lost'; end if;
  perform app_private.publish_import_draft_locked(v_owner,p_id,p_recipe,p_warnings,v_when);
  update public.parse_jobs set status='done', result_recipe_json=p_recipe,result_warnings=p_warnings,
    result_recipe_id=null,error=null,claim_token=null,lease_until=null,updated_at=v_when,
    expires_at=v_when+interval '7 days' where id=p_id;
end $$;
revoke all on function public.finish_import_job(text,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.finish_import_job(text,uuid,jsonb,jsonb) to service_role;

-- Backfill only still-present completed results. Invalid rows stay intact and
-- are returned in the report; already-cleaned results need a surviving device.
create function app_private.backfill_import_drafts()
returns jsonb language plpgsql set search_path = '' as $$
declare v_owner uuid := public.import_owner_uid(); v_id text; v_job public.parse_jobs;
  v_published int := 0; v_skipped int := 0; v_invalid jsonb := '[]'::jsonb;
begin
  if v_owner is null then return jsonb_build_object('published',0,'skipped',0,'invalid',v_invalid); end if;
  for v_id in select id from public.parse_jobs where user_id=v_owner and status='done'
    and result_recipe_json is not null order by id loop
    insert into app_private.library_sync_heads(owner_id) values(v_owner) on conflict do nothing;
    perform 1 from app_private.library_sync_heads where owner_id=v_owner for update;
    select * into v_job from public.parse_jobs where id=v_id and user_id=v_owner for update;
    if v_job.status <> 'done' or v_job.result_recipe_json is null then continue; end if;
    begin
      if app_private.publish_import_draft_locked(v_owner,v_id,v_job.result_recipe_json,v_job.result_warnings,v_job.updated_at)
      then v_published := v_published+1; else v_skipped := v_skipped+1; end if;
    exception when invalid_parameter_value then
      v_invalid := v_invalid || jsonb_build_array(jsonb_build_object('id',v_id,'error',sqlerrm));
    end;
  end loop;
  return jsonb_build_object('published',v_published,'skipped',v_skipped,'invalid',v_invalid);
end $$;
revoke all on function app_private.backfill_import_drafts() from public, anon, authenticated, service_role;
create function public.backfill_import_drafts()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  return app_private.backfill_import_drafts();
end $$;
revoke all on function public.backfill_import_drafts() from public, anon, authenticated;
grant execute on function public.backfill_import_drafts() to service_role;

do $$ declare result jsonb; begin
  result := app_private.backfill_import_drafts();
  raise notice 'Shared import backfill: %',result;
end $$;

create or replace function public.ack_import_job(p_id text)
returns public.parse_jobs language plpgsql security definer set search_path = '' as $$
declare result public.parse_jobs;
begin
  if auth.uid() is null or auth.uid() <> public.import_owner_uid() then raise exception 'not import owner'; end if;
  update public.parse_jobs j set acknowledged_at=coalesce(j.acknowledged_at,clock_timestamp()),updated_at=clock_timestamp()
    where j.id=p_id and j.user_id=auth.uid() and j.status='done'
      and exists(select 1 from public.library_records r where r.owner_id=j.user_id and r.entity_id=j.id
        and r.kind in ('draft','recipe')) returning j.* into result;
  if not found then raise exception 'import draft is not published'; end if;
  return result;
end $$;
revoke all on function public.ack_import_job(text) from public, anon;
grant execute on function public.ack_import_job(text) to authenticated;

-- Keep unpublished/invalid completed results for recovery rather than silently
-- deleting their only copy. Successful source cleanup is independent of drafts.
create or replace function public.cleanup_import_jobs()
returns table(job_id text, storage_path text) language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  update public.parse_jobs j set result_recipe_json=null,result_warnings='[]'::jsonb,
    payload_text=null,source_url=null,updated_at=clock_timestamp()
    where j.user_id=public.import_owner_uid() and j.status='done' and j.acknowledged_at is not null
      and app_private.valid_library_payload('recipe',j.id,j.result_recipe_json)
      and j.result_recipe_json->>'id'=j.id and app_private.library_string_array(j.result_warnings)
      and exists(select 1 from public.library_records r where r.owner_id=j.user_id and r.entity_id=j.id and r.kind in ('draft','recipe'));
  update public.parse_jobs j set status='error',error='Import expired; submit again',
    result_recipe_json=null,result_warnings='[]'::jsonb,payload_text=null,source_url=null,claim_token=null,lease_until=null,
    result_recipe_id=null,updated_at=clock_timestamp(),expires_at=clock_timestamp()+interval '7 days'
    where j.user_id=public.import_owner_uid() and j.expires_at < clock_timestamp()
      and (j.status <> 'error' or j.error is distinct from 'Import expired; submit again')
      and (j.status <> 'done' or ((j.result_recipe_json is null or
        (app_private.valid_library_payload('recipe',j.id,j.result_recipe_json)
          and j.result_recipe_json->>'id'=j.id and app_private.library_string_array(j.result_warnings)))
        and exists(select 1 from public.library_records r where r.owner_id=j.user_id and r.entity_id=j.id and r.kind in ('draft','recipe'))));
  delete from public.parse_jobs j where j.user_id=public.import_owner_uid() and j.status='error'
    and j.expires_at < clock_timestamp() and j.error='Import expired; submit again' and j.storage_path is null;
  return query select j.id,j.storage_path from public.parse_jobs j where j.user_id=public.import_owner_uid() and j.storage_path is not null
    and ((j.status='done' and j.acknowledged_at is not null and j.result_recipe_json is null
      and exists(select 1 from public.library_records r where r.owner_id=j.user_id and r.entity_id=j.id and r.kind in ('draft','recipe')))
      or (j.status='error' and (j.attempts >= 3 or j.error='Import expired; submit again')));
end $$;
revoke all on function public.cleanup_import_jobs() from public, anon, authenticated;
grant execute on function public.cleanup_import_jobs() to service_role;
