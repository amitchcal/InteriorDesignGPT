-- 0014_dna_enqueue.sql
--
-- DNA is user-scoped, not project-scoped: a designer's DNA spans all their
-- projects. The jobs table (0012) assumed a project. Two changes:
--   * project_id becomes nullable (a DNA job has no project).
--   * enqueue_dna_job queues by owned DNA profile instead of owned project.
--
-- Separate migration from 0013 so the 'dna' enum value is committed before this
-- transaction uses it (ALTER TYPE ADD VALUE can't be used in the same
-- transaction that added it).

alter table jobs alter column project_id drop not null;

-- Ownership check is on the DNA profile, the same way enqueue_job checks the
-- project. The profile row is created first (POST /api/dna) and its id rides in
-- the payload; the handler fills its `dna` column when the vision pass finishes.
create or replace function enqueue_dna_job(p_dna uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if not exists (
    select 1 from designer_dna_profiles d where d.id = p_dna and d.owner_id = v_user
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into jobs (project_id, owner_id, kind, payload)
  values (null, v_user, 'dna', jsonb_build_object('dna_id', p_dna))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function enqueue_dna_job(uuid) from public;
grant  execute on function enqueue_dna_job(uuid) to authenticated;
