-- 0011_storage_update_policies.sql
--
-- 0004 gave every bucket SELECT, INSERT and DELETE policies — but no UPDATE.
-- Storage's upsert path issues an UPDATE when the object already exists, so
-- overwriting any file was impossible: the first write to a path succeeded and
-- every rewrite failed with an RLS denial.
--
-- Found when regenerating a proposal (Task 9). The first run wrote
-- proposals/<uid>/<project>/proposal-v2.pdf and the second returned 500.
-- Re-running an engine is the normal case, not the exception — a designer
-- re-costs, re-words, and re-renders — so this affects the renders bucket
-- (Task 10) and dna-assets (Task 11) exactly the same way, and floor-plans
-- whenever a plan is re-uploaded under the same name.
--
-- Same authorization rule as 0004: the leading path segment must be the
-- caller's uid. USING gates which existing rows may be updated; WITH CHECK gates
-- what they may be updated *to* — without the second, a user could rename their
-- object into someone else's folder.

create policy fp_update on storage.objects for update
  using       ( bucket_id = 'floor-plans' and (storage.foldername(name))[1] = auth.uid()::text )
  with check  ( bucket_id = 'floor-plans' and (storage.foldername(name))[1] = auth.uid()::text );

create policy rn_update on storage.objects for update
  using       ( bucket_id = 'renders' and (storage.foldername(name))[1] = auth.uid()::text )
  with check  ( bucket_id = 'renders' and (storage.foldername(name))[1] = auth.uid()::text );

create policy dna_update on storage.objects for update
  using       ( bucket_id = 'dna-assets' and (storage.foldername(name))[1] = auth.uid()::text )
  with check  ( bucket_id = 'dna-assets' and (storage.foldername(name))[1] = auth.uid()::text );

create policy pr_update on storage.objects for update
  using       ( bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text )
  with check  ( bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text );
