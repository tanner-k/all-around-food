-- 0002_storage.sql — Supabase Storage for uploaded import media (Phase 1, ADR 0007)
--
-- Phase 3 import flow uploads screenshots / receipt photos / video stills to a
-- private bucket and enqueues a parse_jobs row pointing at the object. This
-- migration creates that bucket and an owner-only RLS policy on its objects.
--
-- Idempotent: the bucket insert is `on conflict do nothing`; policies are
-- dropped before being (re)created.

-- ---------------------------------------------------------------------------
-- Private bucket for uploaded import media.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- Owner-only access to objects in the `imports` bucket.
--
-- storage.objects has no `user_id` column; ownership is tracked by `owner`
-- (the uploader's auth.uid()). We scope policies to bucket_id = 'imports' and
-- require owner = auth.uid() for every operation. RLS is already enabled on
-- storage.objects by Supabase; we only add the policies.
-- ---------------------------------------------------------------------------
drop policy if exists "imports owner select" on storage.objects;
create policy "imports owner select" on storage.objects
    for select
    using (bucket_id = 'imports' and owner = auth.uid());

drop policy if exists "imports owner insert" on storage.objects;
create policy "imports owner insert" on storage.objects
    for insert
    with check (bucket_id = 'imports' and owner = auth.uid());

drop policy if exists "imports owner update" on storage.objects;
create policy "imports owner update" on storage.objects
    for update
    using (bucket_id = 'imports' and owner = auth.uid())
    with check (bucket_id = 'imports' and owner = auth.uid());

drop policy if exists "imports owner delete" on storage.objects;
create policy "imports owner delete" on storage.objects
    for delete
    using (bucket_id = 'imports' and owner = auth.uid());
