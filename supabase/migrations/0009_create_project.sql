-- 0009_create_project.sql
--
-- Quota-enforced project creation, done in one transaction.
--
-- Why a function instead of checking in the route: a check-then-insert has a
-- TOCTOU race. Two concurrent POSTs both read used=9 of 10, both pass, and the
-- user lands on 11 projects. This is billing — quota is the thing the customer
-- is paying against — so the check and the insert must be atomic. The
-- subscription row is locked FOR UPDATE, which serialises concurrent creates
-- for one owner.
--
-- The count is taken from `projects` rather than trusting
-- subscriptions.used_projects: a counter drifts (a failed insert, a deleted
-- project, a manual fix) and drift here means either giving away projects or
-- charging for ones that don't exist. used_projects is kept in sync for display,
-- but the row count is what's authoritative.

create or replace function create_project(
  p_name        text,
  p_market_code text,
  p_intake      jsonb default '{}'::jsonb,
  p_org_id      uuid  default null
)
returns projects
language plpgsql security definer set search_path = public as $$
declare
  v_user    uuid := auth.uid();
  v_quota   int;
  v_sub_id  uuid;
  v_count   int;
  v_project projects;
begin
  if v_user is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  -- This is security definer, so RLS is off: an org_id must be checked by hand.
  -- Without this a user could file a project into any org by guessing its id.
  if p_org_id is not null and not exists (
    select 1 from org_members m where m.org_id = p_org_id and m.user_id = v_user
  ) then
    raise exception 'forbidden_org' using errcode = '42501';
  end if;

  select id, quota_projects into v_sub_id, v_quota
  from subscriptions
  where owner_id = v_user
  for update;                      -- serialises concurrent creates for this owner

  if not found then
    raise exception 'no_subscription' using errcode = 'P0002';
  end if;

  select count(*) into v_count from projects where owner_id = v_user;

  if v_count >= v_quota then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  insert into projects (owner_id, org_id, market_code, name, intake, status)
  values (v_user, p_org_id, p_market_code, p_name, p_intake, 'draft')
  returning * into v_project;

  update subscriptions set used_projects = v_count + 1 where id = v_sub_id;

  return v_project;
end;
$$;

revoke execute on function create_project(text, text, jsonb, uuid) from public;
grant  execute on function create_project(text, text, jsonb, uuid) to authenticated;
