-- 0006_fix_org_rls_recursion.sql
--
-- Bug: `org_read` (on organizations) subqueries org_members, while `orgmem_read`
-- (on org_members) subqueries organizations. Each subquery is itself RLS-checked,
-- so the two policies invoke each other without end:
--
--   ERROR: infinite recursion detected in policy for relation "organizations"
--
-- Both tables were entirely unreadable. `projects_rw` shares the defect: it
-- subqueries org_members, which drags in orgmem_read -> organizations -> ...
--
-- Fix: route every cross-table membership check through a `security definer`
-- helper. Those run as the function owner and are exempt from RLS, so the cycle
-- breaks. This is the pattern 0001 already established with `owns_project()`.
--
-- Rule for future policies: a policy on table X must never subquery table Y
-- whose own policy subqueries X. Use a security-definer helper instead.

-- ---------------------------------------------------------------------------
-- Helpers — security definer, so they see through RLS.
-- `set search_path = public` prevents search_path hijacking (these are definer
-- functions; without it a caller could shadow the tables they resolve).
-- ---------------------------------------------------------------------------
create or replace function is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members m
    where m.org_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function is_org_owner(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organizations o
    where o.id = org and o.owner_id = auth.uid()
  );
$$;

revoke execute on function is_org_member(uuid) from public;
revoke execute on function is_org_owner(uuid)  from public;
grant execute on function is_org_member(uuid) to authenticated;
grant execute on function is_org_owner(uuid)  to authenticated;

-- ---------------------------------------------------------------------------
-- organizations — owner or member reads; owner writes.
-- ---------------------------------------------------------------------------
drop policy if exists org_read  on organizations;
drop policy if exists org_write on organizations;

create policy org_read on organizations for select
  using (owner_id = auth.uid() or is_org_member(id));

create policy org_write on organizations for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- org_members — a member sees their own row; the owner sees and manages all.
-- ---------------------------------------------------------------------------
drop policy if exists orgmem_read  on org_members;
drop policy if exists orgmem_write on org_members;

create policy orgmem_read on org_members for select
  using (user_id = auth.uid() or is_org_owner(org_id));

-- 0001 omitted `with check` here, so an owner could INSERT a member row into an
-- org they don't own — USING is not consulted on INSERT. Both clauses now.
create policy orgmem_write on org_members for all
  using (is_org_owner(org_id))
  with check (is_org_owner(org_id));

-- ---------------------------------------------------------------------------
-- projects — same recursion via the inlined org_members subquery.
-- ---------------------------------------------------------------------------
drop policy if exists projects_rw on projects;

create policy projects_rw on projects for all
  using (owner_id = auth.uid() or (org_id is not null and is_org_member(org_id)))
  with check (owner_id = auth.uid() or (org_id is not null and is_org_member(org_id)));
