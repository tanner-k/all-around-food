-- Transient import drafts. Configure app_private.import_owner with the existing
-- auth user UUID before enabling imports; an unset owner fails closed.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
create table if not exists app_private.import_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null
);
revoke all on app_private.import_owner from public, anon, authenticated;

create or replace function public.import_owner_uid() returns uuid
language sql stable security definer set search_path = ''
as $$ select user_id from app_private.import_owner where singleton = true $$;
revoke all on function public.import_owner_uid() from public, anon;
grant execute on function public.import_owner_uid() to authenticated, service_role;

alter table public.parse_jobs
  add column if not exists result_recipe_json jsonb,
  add column if not exists result_warnings jsonb not null default '[]'::jsonb,
  add column if not exists lease_until timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days');
alter table public.parse_jobs drop constraint if exists parse_jobs_kind_check;
alter table public.parse_jobs add constraint parse_jobs_kind_check
  check (kind in ('url','video','screenshot','text','shopping_list','receipt'));
alter table public.parse_jobs add constraint parse_jobs_result_warnings_array
  check (jsonb_typeof(result_warnings) = 'array');
alter table public.parse_jobs add constraint parse_jobs_payload_limit
  check (payload_text is null or length(payload_text) <= 50000);
alter table public.parse_jobs add constraint parse_jobs_source_url_limit
  check (source_url is null or length(source_url) <= 4096);
alter table public.parse_jobs add constraint parse_jobs_uuid_id
  check (id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- The original all-operations owner policy remains useful for SELECT, but
-- privileges prevent direct mutations. The insert policy also gates the owner.
drop policy if exists "owner" on public.parse_jobs;
create policy "import owner read" on public.parse_jobs for select to authenticated
  using (user_id = auth.uid() and user_id = public.import_owner_uid());
create policy "import owner insert" on public.parse_jobs for insert to authenticated
  with check (user_id = auth.uid() and user_id = public.import_owner_uid());
revoke insert, update, delete on public.parse_jobs from public, anon, authenticated;
grant select on public.parse_jobs to authenticated;
grant insert (id, kind, source_url, storage_path, payload_text)
  on public.parse_jobs to authenticated;

-- Legacy claim function must not remain callable by signed-in browsers.
revoke all on function public.claim_parse_jobs(int,int) from public, anon, authenticated;
drop function public.claim_parse_jobs(int,int);

create or replace function public.claim_parse_jobs(p_limit int default 1)
returns setof public.parse_jobs language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  -- A lease that hit the attempt cap is visible to the owner as an error.
  update public.parse_jobs set status = 'error', error = 'Import failed after 3 attempts',
    claim_token = null, lease_until = null, updated_at = now()
  where attempts >= 3 and (status = 'pending'
    or (status = 'processing' and lease_until < now()));
  return query
  with candidate as (
    select id from public.parse_jobs
    where ((status = 'pending') or (status = 'processing' and lease_until < now()))
      and attempts < 3 and expires_at > now()
      and user_id = public.import_owner_uid()
    order by created_at limit 1
    for update skip locked
  )
  update public.parse_jobs j set status = 'processing', attempts = j.attempts + 1,
    claim_token = gen_random_uuid(), lease_until = now() + interval '10 minutes',
    error = null, updated_at = now()
  from candidate where j.id = candidate.id returning j.*;
end $$;
revoke all on function public.claim_parse_jobs(int) from public, anon, authenticated;
grant execute on function public.claim_parse_jobs(int) to service_role;

create or replace function public.renew_import_job(p_id text, p_claim_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  update public.parse_jobs set lease_until = now() + interval '10 minutes', updated_at = now()
  where id = p_id and claim_token = p_claim_token and status = 'processing'
    and lease_until > now() and user_id = public.import_owner_uid();
  if not found then raise exception 'import claim lost'; end if;
end $$;
revoke all on function public.renew_import_job(text,uuid) from public, anon, authenticated;
grant execute on function public.renew_import_job(text,uuid) to service_role;

create or replace function public.finish_import_job(
  p_id text, p_claim_token uuid, p_recipe jsonb, p_warnings jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if coalesce(jsonb_typeof(p_recipe),'') <> 'object'
     or coalesce(p_recipe->>'id','') <> p_id
     or nullif(trim(p_recipe->>'title'), '') is null
     or jsonb_typeof(p_recipe->'ingredients') <> 'array'
     or (case when jsonb_typeof(p_recipe->'ingredients') = 'array'
       then jsonb_array_length(p_recipe->'ingredients') = 0 else true end)
     or jsonb_typeof(p_recipe->'steps') <> 'array'
     or (case when jsonb_typeof(p_recipe->'steps') = 'array'
       then jsonb_array_length(p_recipe->'steps') = 0 else true end)
     or coalesce(jsonb_typeof(p_warnings),'') <> 'array'
  then raise exception 'invalid recipe draft'; end if;
  update public.parse_jobs set status = 'done', result_recipe_json = p_recipe,
    result_warnings = p_warnings, result_recipe_id = null, error = null,
    claim_token = null, lease_until = null, updated_at = now(),
    expires_at = now() + interval '7 days'
  where id = p_id and claim_token = p_claim_token and status = 'processing'
    and lease_until > now() and user_id = public.import_owner_uid();
  if not found then raise exception 'import claim lost'; end if;
end $$;
revoke all on function public.finish_import_job(text,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.finish_import_job(text,uuid,jsonb,jsonb) to service_role;

create or replace function public.fail_import_job(p_id text, p_claim_token uuid, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  update public.parse_jobs set status = 'error',
    error = left(coalesce(nullif(p_message,''), 'Import failed'), 1000),
    claim_token = null, lease_until = null, updated_at = now()
  where id = p_id and claim_token = p_claim_token and status = 'processing'
    and lease_until > now() and user_id = public.import_owner_uid();
  if not found then raise exception 'import claim lost'; end if;
end $$;
revoke all on function public.fail_import_job(text,uuid,text) from public, anon, authenticated;
grant execute on function public.fail_import_job(text,uuid,text) to service_role;

create or replace function public.retry_import_job(p_id text)
returns public.parse_jobs language plpgsql security definer set search_path = '' as $$
declare result public.parse_jobs;
begin
  if auth.uid() is null or auth.uid() <> public.import_owner_uid() then
    raise exception 'not import owner'; end if;
  update public.parse_jobs set status = 'pending', error = null, updated_at = now()
  where id = p_id and user_id = auth.uid() and status = 'error'
    and attempts < 3 and expires_at > now()
  returning * into result;
  if not found then raise exception 'import cannot be retried'; end if;
  return result;
end $$;
revoke all on function public.retry_import_job(text) from public, anon;
grant execute on function public.retry_import_job(text) to authenticated;

create or replace function public.ack_import_job(p_id text)
returns public.parse_jobs language plpgsql security definer set search_path = '' as $$
declare result public.parse_jobs;
begin
  if auth.uid() is null or auth.uid() <> public.import_owner_uid() then
    raise exception 'not import owner'; end if;
  update public.parse_jobs set acknowledged_at = coalesce(acknowledged_at, now()),
    updated_at = now()
  where id = p_id and user_id = auth.uid() and status = 'done'
  returning * into result;
  if not found then raise exception 'import is not done'; end if;
  return result;
end $$;
revoke all on function public.ack_import_job(text) from public, anon;
grant execute on function public.ack_import_job(text) to authenticated;

-- Return paths until external Storage removal succeeds; the worker must call
-- forget_import_storage afterward. Never delete Storage bytes through SQL.
create or replace function public.cleanup_import_jobs()
returns table(job_id text, storage_path text) language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  update public.parse_jobs set result_recipe_json = null, result_warnings = '[]'::jsonb,
    payload_text = null, source_url = null, updated_at = now()
  where status = 'done' and acknowledged_at is not null
    and (result_recipe_json is not null or payload_text is not null or source_url is not null);
  update public.parse_jobs set status = 'error', error = 'Import expired; submit again',
    result_recipe_json = null, result_warnings = '[]'::jsonb,
    payload_text = null, source_url = null, claim_token = null, lease_until = null,
    result_recipe_id = null, updated_at = now(), expires_at = now() + interval '7 days'
  where expires_at < now() and (status <> 'error'
    or error is distinct from 'Import expired; submit again');
  delete from public.parse_jobs j where j.status = 'error' and j.expires_at < now()
    and j.error = 'Import expired; submit again' and j.storage_path is null;
  return query select j.id, j.storage_path from public.parse_jobs j
    where j.storage_path is not null
      and ((j.status = 'done' and j.acknowledged_at is not null)
        or (j.status = 'error' and (j.attempts >= 3
          or j.error = 'Import expired; submit again')));
end $$;
revoke all on function public.cleanup_import_jobs() from public, anon, authenticated;
grant execute on function public.cleanup_import_jobs() to service_role;

create or replace function public.forget_import_storage(p_id text, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  update public.parse_jobs set storage_path = null where id = p_id and storage_path = p_path
    and ((status = 'done' and acknowledged_at is not null)
      or (status = 'error' and (attempts >= 3
        or error = 'Import expired; submit again')));
end $$;
revoke all on function public.forget_import_storage(text,text) from public, anon, authenticated;
grant execute on function public.forget_import_storage(text,text) to service_role;

create or replace function public.list_import_orphans()
returns setof text language sql security definer set search_path = '' as $$
  select o.name from storage.objects o
  where auth.role() = 'service_role' and o.bucket_id = 'imports'
    and o.name like public.import_owner_uid()::text || '/%'
    and o.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.parse_jobs j where j.storage_path = o.name)
$$;
revoke all on function public.list_import_orphans() from public, anon, authenticated;
grant execute on function public.list_import_orphans() to service_role;

-- Storage owner paths, MIME and size are checked again in the worker.
update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'imports';
drop policy if exists "imports owner insert" on storage.objects;
create policy "imports owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and owner = auth.uid()
    and auth.uid() = public.import_owner_uid()
    and name ~ ('^' || auth.uid()::text || '/[0-9a-fA-F-]{36}[.](jpg|png|webp)$'));
-- No browser mutation or removal of queued objects; worker owns cleanup.
drop policy if exists "imports owner update" on storage.objects;
drop policy if exists "imports owner delete" on storage.objects;
