-- 0015_org_viewer_readonly.sql
--
-- E5-5 requires that in an agency, a viewer can SEE the org's projects but not
-- EDIT them. The 0001 policy `projects_rw` gated every command (read and write)
-- on is_org_member, so a viewer could edit — the agency-hub acceptance test
-- would fail. Split it: any member reads; only owner/designer writes.
--
-- org_members.role is 'owner' | 'designer' | 'viewer'. A viewer is a member for
-- reads (is_org_member) but not an editor (is_org_editor).

create or replace function is_org_editor(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members m
    where m.org_id = org and m.user_id = auth.uid()
      and m.role in ('owner','designer')
  );
$$;

revoke execute on function is_org_editor(uuid) from public;
grant  execute on function is_org_editor(uuid) to authenticated;

drop policy if exists projects_rw on projects;

-- Read: the owner, or any member of the project's org (viewers included).
create policy projects_read on projects for select
  using (
    owner_id = auth.uid()
    or (org_id is not null and is_org_member(org_id))
  );

-- Write: a personal project (no org) is fully the owner's; an org project is
-- writable only by an org editor (owner/designer) — regardless of who owns the
-- row. The org branch must NOT fall back to owner_id, or a viewer could file a
-- project they own into an org they only view and inject it into the agency hub.
create policy projects_write on projects for all
  using (
    (owner_id = auth.uid() and org_id is null)
    or (org_id is not null and is_org_editor(org_id))
  )
  with check (
    (owner_id = auth.uid() and org_id is null)
    or (org_id is not null and is_org_editor(org_id))
  );

-- create_project (0009) is SECURITY DEFINER, so it bypasses the policy above and
-- must enforce the same rule itself. It checked org *membership*; tighten to
-- editor so a viewer can't create an org project through the API either.
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

  -- Org projects require editor role (owner/designer), not mere membership.
  if p_org_id is not null and not is_org_editor(p_org_id) then
    raise exception 'forbidden_org' using errcode = '42501';
  end if;

  select id, quota_projects into v_sub_id, v_quota
  from subscriptions where owner_id = v_user for update;
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
