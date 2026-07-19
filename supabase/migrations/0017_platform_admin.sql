-- 0017_platform_admin.sql
--
-- Platform super-admin (operator back-office). This is the HIGHEST-privilege
-- concept in the app: an admin's routes read and write ACROSS every tenant,
-- bypassing the RLS that isolates studios. So the design is deliberately narrow:
--
--   * A separate identity — `platform_admins` — NOT an org role. A studio owner
--     can never become a platform admin through any tenant action.
--   * Admission is out-of-band ONLY. There is no policy that lets anyone INSERT
--     into platform_admins, so the API can't grant admin. You seed the first
--     admin with the service role / SQL editor (see bottom of this file).
--   * The app's admin routes gate on is_platform_admin() and then use the
--     service-role client for cross-tenant work — the guard is the whole
--     security boundary, so it runs on every admin route.

-- ---------------------------------------------------------------------------
-- Identity. Membership = a row here. Reads are admin-only; writes are denied to
-- every API role (no insert/update/delete policy) — service_role bypasses RLS
-- for seeding.
-- ---------------------------------------------------------------------------
create table if not exists platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

-- security definer so the policy below (and the guard) can check membership
-- without the caller being able to read the table directly. No recursion:
-- definer functions run as owner with RLS off inside.
create or replace function is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins a where a.user_id = auth.uid());
$$;

revoke execute on function is_platform_admin() from public;
grant  execute on function is_platform_admin() to authenticated;

-- An admin may see the admin list; nobody else can. No write policies exist, so
-- INSERT/UPDATE/DELETE are denied to authenticated/anon entirely.
drop policy if exists padmin_read on platform_admins;
create policy padmin_read on platform_admins for select using (is_platform_admin());

grant select on platform_admins to authenticated;

-- ---------------------------------------------------------------------------
-- Studio lifecycle state, so an admin can suspend/reactivate a studio.
-- NOTE: this stores the state; enforcing it (blocking a suspended studio's
-- access) is a separate, deliberate follow-up — see docs/admin.md.
-- ---------------------------------------------------------------------------
alter table organizations
  add column if not exists status text not null default 'active'
    check (status in ('active','suspended'));

-- ---------------------------------------------------------------------------
-- Seeding the first admin (run once, out-of-band, as the service role or in the
-- Supabase SQL editor — NOT through the app):
--
--   insert into platform_admins (user_id, note)
--   values ('<auth-users-uuid>', 'founder');
--
-- Find the uuid in auth.users by email. There is intentionally no self-serve
-- path to become an admin.
-- ---------------------------------------------------------------------------
