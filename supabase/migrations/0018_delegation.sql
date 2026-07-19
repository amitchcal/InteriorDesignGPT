-- 0018_delegation.sql
--
-- Studio delegation (Team & Delegation page). The owner assigns projects and
-- breaks them into tasks; a designer sees their queue and can only tick their
-- own task done. "Owner only" per the product decision:
--
--   * assign a project / set its due date  -> owner only
--   * create / edit / delete tasks         -> owner only
--   * mark a task done                      -> the task's assignee (or the owner)
--
-- Enforcement notes:
--   * `can_manage_project` = owner of the project's org, or (for a personal,
--     org-less project) the project's own owner. This is the owner-level gate.
--   * `can_see_project` mirrors projects_read (0015) so a member sees the board.
--   * Project assignment is column-restricted to the owner via the
--     `assign_project` function: projects_write (0015) lets any org editor UPDATE
--     a project, so we route assignment through a definer function that checks
--     `can_manage_project` itself rather than relying on the row policy.
--   * Marking done is column-restricted to the assignee via `set_task_done`
--     (RLS can't grant "update only the done column").

-- ---------------------------------------------------------------------------
-- Project-level assignment + due date.
-- ---------------------------------------------------------------------------
alter table projects
  add column if not exists assignee_id uuid references auth.users(id) on delete set null,
  add column if not exists due_date    date;

create index if not exists projects_assignee_idx on projects (assignee_id);

-- ---------------------------------------------------------------------------
-- Permission helpers (security definer -> see through RLS, no recursion since
-- nothing they read has a policy that reads project_tasks).
-- ---------------------------------------------------------------------------
create or replace function can_see_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects pr
    where pr.id = p
      and (pr.owner_id = auth.uid()
           or (pr.org_id is not null and is_org_member(pr.org_id)))
  );
$$;

create or replace function can_manage_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects pr
    where pr.id = p
      and ((pr.org_id is not null and is_org_owner(pr.org_id))
           or (pr.org_id is null and pr.owner_id = auth.uid()))
  );
$$;

revoke execute on function can_see_project(uuid)    from public;
revoke execute on function can_manage_project(uuid) from public;
grant  execute on function can_see_project(uuid)    to authenticated;
grant  execute on function can_manage_project(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Per-project tasks.
-- ---------------------------------------------------------------------------
create table if not exists project_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  title       text not null,
  assignee_id uuid references auth.users(id) on delete set null,
  done        boolean not null default false,
  due_date    date,
  created_at  timestamptz not null default now()
);

create index if not exists project_tasks_project_idx  on project_tasks (project_id);
create index if not exists project_tasks_assignee_idx on project_tasks (assignee_id);

alter table project_tasks enable row level security;

drop policy if exists tasks_read  on project_tasks;
drop policy if exists tasks_write on project_tasks;

-- Any member of the project's org (and the project owner) sees the tasks.
create policy tasks_read on project_tasks for select
  using (can_see_project(project_id));

-- Only the owner creates / edits / deletes tasks. A designer's "done" toggle
-- goes through set_task_done() below, not this policy.
create policy tasks_write on project_tasks for all
  using (can_manage_project(project_id))
  with check (can_manage_project(project_id));

grant select, insert, update, delete on project_tasks to authenticated;

-- ---------------------------------------------------------------------------
-- assign_project — owner-only project assignment. Validates the assignee is a
-- member of the project's org (or, for a personal project, the owner).
-- ---------------------------------------------------------------------------
create or replace function assign_project(p_project uuid, p_assignee uuid, p_due date)
returns projects language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid;
  v_owner uuid;
  v_row   projects;
begin
  select org_id, owner_id into v_org, v_owner from projects where id = p_project;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not can_manage_project(p_project) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_assignee is not null then
    if v_org is not null then
      if not exists (select 1 from org_members where org_id = v_org and user_id = p_assignee) then
        raise exception 'assignee_not_member' using errcode = '23514';
      end if;
    elsif p_assignee <> v_owner then
      raise exception 'assignee_not_member' using errcode = '23514';
    end if;
  end if;

  update projects set assignee_id = p_assignee, due_date = p_due
  where id = p_project
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function assign_project(uuid, uuid, date) from public;
grant  execute on function assign_project(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- set_task_done — the ONLY write a non-owner may make: the task's assignee (or
-- the owner) toggles `done`. Nothing else about the task can change here.
-- ---------------------------------------------------------------------------
create or replace function set_task_done(p_task uuid, p_done boolean)
returns project_tasks language plpgsql security definer set search_path = public as $$
declare
  v_project  uuid;
  v_assignee uuid;
  v_row      project_tasks;
begin
  select project_id, assignee_id into v_project, v_assignee
  from project_tasks where id = p_task;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not (can_manage_project(v_project) or v_assignee = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update project_tasks set done = p_done where id = p_task returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function set_task_done(uuid, boolean) from public;
grant  execute on function set_task_done(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- org_team — the member directory a studio member may see: name + email + role
-- for everyone in an org they belong to. Definer so it can read profiles and
-- auth.users past their RLS; the `is_org_member` guard keeps it to co-members.
-- ---------------------------------------------------------------------------
create or replace function org_team(org uuid)
returns table (user_id uuid, display_name text, email text, role org_role)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.full_name, u.email, m.role
  from org_members m
  left join profiles p   on p.user_id = m.user_id
  left join auth.users u on u.id = m.user_id
  where m.org_id = org and is_org_member(org)
  order by m.role, p.full_name nulls last;
$$;

revoke execute on function org_team(uuid) from public;
grant  execute on function org_team(uuid) to authenticated;
