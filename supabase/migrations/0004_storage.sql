-- 0004_storage.sql · Supabase Storage buckets + RLS
-- Storage policies are SEPARATE from table RLS. Without these, uploaded files
-- (floor plans, renders, DNA assets, proposal PDFs) can leak across users.
--
-- Path convention (enforced by policy): the first folder segment is the owner's
-- auth uid, e.g.  floor-plans/<uid>/<project_id>/plan.pdf
-- This lets us authorize by comparing auth.uid() to the leading path segment.

-- Buckets ------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('floor-plans','floor-plans', false),
  ('renders','renders',         false),
  ('dna-assets','dna-assets',   false),
  ('proposals','proposals',     false)
on conflict (id) do nothing;

-- Helper: first path segment equals the caller's uid
-- storage.foldername(name) returns the path split into an array.
-- (no function needed; inline the check in each policy)

-- floor-plans --------------------------------------------------------------
create policy fp_read on storage.objects for select
  using ( bucket_id = 'floor-plans' and (storage.foldername(name))[1] = auth.uid()::text );
create policy fp_write on storage.objects for insert
  with check ( bucket_id = 'floor-plans' and (storage.foldername(name))[1] = auth.uid()::text );
create policy fp_delete on storage.objects for delete
  using ( bucket_id = 'floor-plans' and (storage.foldername(name))[1] = auth.uid()::text );

-- renders ------------------------------------------------------------------
create policy rn_read on storage.objects for select
  using ( bucket_id = 'renders' and (storage.foldername(name))[1] = auth.uid()::text );
create policy rn_write on storage.objects for insert
  with check ( bucket_id = 'renders' and (storage.foldername(name))[1] = auth.uid()::text );
create policy rn_delete on storage.objects for delete
  using ( bucket_id = 'renders' and (storage.foldername(name))[1] = auth.uid()::text );

-- dna-assets ---------------------------------------------------------------
create policy dna_read on storage.objects for select
  using ( bucket_id = 'dna-assets' and (storage.foldername(name))[1] = auth.uid()::text );
create policy dna_write on storage.objects for insert
  with check ( bucket_id = 'dna-assets' and (storage.foldername(name))[1] = auth.uid()::text );
create policy dna_delete on storage.objects for delete
  using ( bucket_id = 'dna-assets' and (storage.foldername(name))[1] = auth.uid()::text );

-- proposals ----------------------------------------------------------------
create policy pr_read on storage.objects for select
  using ( bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text );
create policy pr_write on storage.objects for insert
  with check ( bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text );
create policy pr_delete on storage.objects for delete
  using ( bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text );

-- NOTE on client-facing sharing (E5-6, deferred): when a read-only client share
-- link is built, generate short-lived SIGNED URLs server-side rather than making
-- any bucket public. Buckets stay private.
