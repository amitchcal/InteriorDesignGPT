-- 0012_jobs.sql — background job queue
--
-- Concept, BOQ and Proposal run 2-4 minutes each. Inline in a request that
-- exceeds Vercel's function limit, they can't run in production — docs/infra.md
-- requires a queue + worker. This is that queue, Postgres-backed so it adds no
-- external vendor and stays portable (CLAUDE.md: host-agnostic).
--
-- The claim uses FOR UPDATE SKIP LOCKED — the standard pattern so N concurrent
-- workers never take the same job. Same security-definer + ownership approach
-- as create_project() and owns_project(), which are already proven here.

create type job_kind   as enum ('concept','boq','proposal');
create type job_status as enum ('queued','running','done','failed');

create table jobs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  kind         job_kind   not null,
  status       job_status not null default 'queued',
  payload      jsonb not null default '{}'::jsonb,
  result       jsonb,                       -- engine result on success
  error        text,                        -- message on failure
  attempts     int  not null default 0,
  max_attempts int  not null default 3,
  locked_at    timestamptz,
  locked_by    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- Partial index over exactly the rows the claim scans.
create index jobs_claim_idx   on jobs (created_at) where status = 'queued';
create index jobs_project_idx on jobs (project_id);

alter table jobs enable row level security;

-- A user reads only their own jobs (for polling). All writes go through the
-- functions below or the service role — never a direct authed insert, so a user
-- cannot forge a job for a project they don't own.
grant select on jobs to authenticated;
create policy jobs_read_own on jobs for select using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- enqueue_job — validates ownership, then queues. Mirrors create_project.
-- ---------------------------------------------------------------------------
create or replace function enqueue_job(p_kind job_kind, p_project uuid, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if not owns_project(p_project) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into jobs (project_id, owner_id, kind, payload)
  values (p_project, v_user, p_kind, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function enqueue_job(job_kind, uuid, jsonb) from public;
grant  execute on function enqueue_job(job_kind, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- claim_job — atomically hand one queued job to a worker. SKIP LOCKED so
-- parallel workers never collide. Runs as the service role (worker), not a user.
-- ---------------------------------------------------------------------------
create or replace function claim_job(p_worker text)
returns setof jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update jobs j
  set status = 'running', attempts = attempts + 1,
      locked_at = now(), locked_by = p_worker, updated_at = now()
  where j.id = (
    select id from jobs
    where status = 'queued'
    order by created_at
    for update skip locked
    limit 1
  )
  returning j.*;
end;
$$;

-- Only the service role (the worker) may claim — revoking from public removed
-- it for service_role too (which held it via public), so grant it back
-- explicitly. Never granted to authenticated: a user must not claim jobs.
revoke execute on function claim_job(text) from public;
grant  execute on function claim_job(text) to service_role;
