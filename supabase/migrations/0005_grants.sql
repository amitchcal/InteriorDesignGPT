-- 0005_grants.sql — table privileges for the PostgREST roles.
--
-- Why this exists: 0001 enables RLS and writes policies, but never GRANTs.
-- Those are two different gates. RLS filters *rows*; GRANT decides whether the
-- role may touch the *table* at all. Without both, every supabase-js read fails
-- with `42501 permission denied`, policies notwithstanding.
--
-- It is not covered by Supabase's default privileges: these tables are owned by
-- `postgres` (the role migrations run as), and the default ACL for `postgres`
-- grants anon/authenticated only Dxtm (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN).
-- Only tables created by `supabase_admin` inherit arwdDxtm. So we grant
-- explicitly — which is also portable, and independent of who runs the DDL.
--
-- Privilege model (CLAUDE.md non-negotiable #2):
--   anon          — nothing. Unauthenticated callers get no app data.
--   authenticated — DML on user-facing tables; RLS narrows it to their rows.
--                   Reference tables are READ-ONLY.
--   service_role  — full access; bypasses RLS. Writes reference data.

-- ---------------------------------------------------------------------------
-- Schema usage
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- User-facing tables — RLS policies in 0001 constrain which rows are visible.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on table
  profiles,
  organizations,
  org_members,
  projects,
  floor_plans,
  rooms,
  design_concepts,
  boq_items,
  boq_summaries,
  proposals,
  designer_dna_profiles,
  dna_training_assets,
  render_jobs,
  subscriptions
to authenticated;

-- ---------------------------------------------------------------------------
-- Reference data — the moat. Read-only to authenticated; service role writes.
-- ---------------------------------------------------------------------------
grant select on table market_profiles, rate_libraries to authenticated;

-- ---------------------------------------------------------------------------
-- Service role — bypasses RLS, still needs the grant.
-- ---------------------------------------------------------------------------
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Future tables created by `postgres` inherit the same model.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
