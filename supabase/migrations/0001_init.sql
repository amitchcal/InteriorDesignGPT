-- 0001_init.sql — Interior AI schema of record
-- Postgres / Supabase. Money stored as integer minor units (paise/cents).
-- RLS enabled on all user-facing tables; reference tables are read-only to
-- authenticated users and writable only by the service role.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type tier        as enum ('economy','premium','luxury');
create type project_status as enum ('draft','validated','concept','boq','proposal','complete');
create type org_role     as enum ('owner','designer','viewer');
create type render_status as enum ('queued','running','done','failed');
create type asset_kind    as enum ('image','moodboard','material','render');

-- ---------------------------------------------------------------------------
-- Identity & org
-- ---------------------------------------------------------------------------
create table profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  full_name           text,
  designer_brand      text,
  default_market_code text not null default 'IN',
  created_at          timestamptz not null default now()
);

create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  plan       text not null default 'starter',
  created_at timestamptz not null default now()
);

create table org_members (
  org_id  uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role    org_role not null default 'designer',
  primary key (org_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Localization (reference data — the moat factory)
-- ---------------------------------------------------------------------------
create table market_profiles (
  market_code  text primary key,            -- 'IN','US',...
  config       jsonb not null,              -- currency, units, tax, standards, cultural_rules, brand_tiers
  version      int  not null default 1,
  active       boolean not null default true,
  updated_at   timestamptz not null default now()
);

create table rate_libraries (
  id          uuid primary key default gen_random_uuid(),
  market_code text not null references market_profiles(market_code),
  item_code   text not null,
  item_label  text not null,
  category    text not null,
  unit        text not null,               -- sqft | rft | point | unit | set | nos
  rate_minor  bigint not null check (rate_minor >= 0),  -- ex-tax, minor units
  tier        tier not null,
  region      text not null default 'metro',
  notes       text,
  version     int  not null default 1,
  updated_at  timestamptz not null default now(),
  unique (market_code, item_code)          -- required for upsert (admin export depends on this)
);
create index rate_libraries_market_cat_idx on rate_libraries (market_code, category);
create index rate_libraries_market_tier_idx on rate_libraries (market_code, tier);

-- ---------------------------------------------------------------------------
-- Projects & inputs
-- ---------------------------------------------------------------------------
create table projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  org_id      uuid references organizations(id) on delete set null,
  market_code text not null references market_profiles(market_code),
  name        text not null,
  status      project_status not null default 'draft',
  intake      jsonb not null default '{}'::jsonb,  -- client_brief, preferences, cultural_overrides
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index projects_owner_idx on projects (owner_id);

create table floor_plans (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_url text not null,
  parsed     jsonb,                        -- vision output (rooms/dims), pre-confirmation
  confirmed  boolean not null default false,
  created_at timestamptz not null default now()
);

create table rooms (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name       text not null,
  length     numeric(8,2),
  width      numeric(8,2),
  ceiling_ht numeric(8,2),
  unit       text not null default 'ft',
  meta       jsonb not null default '{}'::jsonb  -- doors, windows, fixed_plumbing, structural_constraints
);

-- ---------------------------------------------------------------------------
-- Generated artefacts (versioned)
-- ---------------------------------------------------------------------------
create table design_concepts (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version    int  not null default 1,
  concept    jsonb not null,               -- sections A + E (render brief)
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create table boq_items (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version    int  not null default 1,
  room       text not null,
  item_code  text,
  spec       text not null,
  qty        numeric(12,2) not null,
  unit       text not null,
  rate_minor bigint not null,
  amount_minor bigint not null,
  tier       tier not null
);
create index boq_items_project_ver_idx on boq_items (project_id, version);

create table boq_summaries (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  version       int  not null default 1,
  subtotal_minor bigint not null,
  tax_minor     bigint not null,
  total_minor   bigint not null,
  currency      text not null,
  budget_delta_minor bigint,              -- total - client budget (negative = under)
  value_eng     jsonb,                    -- ranked options [{label, delta_minor, note}]
  created_at    timestamptz not null default now(),
  unique (project_id, version)
);

create table proposals (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version    int  not null default 1,
  pdf_url    text,
  copy       jsonb not null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

-- ---------------------------------------------------------------------------
-- Designer DNA (stickiness)
-- ---------------------------------------------------------------------------
create table designer_dna_profiles (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  dna          jsonb not null,            -- preferred_materials, colors, layout_patterns, signature_elements
  source_count int  not null default 0,
  created_at   timestamptz not null default now()
);

create table dna_training_assets (
  id        uuid primary key default gen_random_uuid(),
  dna_id    uuid not null references designer_dna_profiles(id) on delete cascade,
  asset_url text not null,
  kind      asset_kind not null
);

-- ---------------------------------------------------------------------------
-- Muscle layer (vendor-abstracted)
-- ---------------------------------------------------------------------------
create table render_jobs (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  room       text,
  provider   text not null,               -- 'generative'
  status     render_status not null default 'queued',
  input      jsonb not null,              -- render brief
  output_url text,
  cost_minor bigint,
  created_at timestamptz not null default now()
);
create index render_jobs_project_idx on render_jobs (project_id);

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------
create table subscriptions (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  org_id         uuid references organizations(id) on delete set null,
  plan           text not null,
  provider       text not null,            -- 'stripe' | 'razorpay'
  status         text not null default 'active',
  quota_projects int  not null default 10,
  used_projects  int  not null default 0,
  period_end     timestamptz
);

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table profiles               enable row level security;
alter table organizations          enable row level security;
alter table org_members            enable row level security;
alter table projects               enable row level security;
alter table floor_plans            enable row level security;
alter table rooms                  enable row level security;
alter table design_concepts        enable row level security;
alter table boq_items              enable row level security;
alter table boq_summaries          enable row level security;
alter table proposals              enable row level security;
alter table designer_dna_profiles  enable row level security;
alter table dna_training_assets    enable row level security;
alter table render_jobs            enable row level security;
alter table subscriptions          enable row level security;
alter table market_profiles        enable row level security;
alter table rate_libraries         enable row level security;

-- Helper: does the current user own / can access this project?
create or replace function owns_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects pr
    where pr.id = p and (
      pr.owner_id = auth.uid()
      or (pr.org_id is not null and exists (
        select 1 from org_members m where m.org_id = pr.org_id and m.user_id = auth.uid()
      ))
    )
  );
$$;

-- profiles: a user sees/edits only their own
create policy profiles_self on profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- organizations: owner or member can read; owner can write
create policy org_read on organizations for select using (
  owner_id = auth.uid()
  or exists (select 1 from org_members m where m.org_id = id and m.user_id = auth.uid())
);
create policy org_write on organizations for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy orgmem_read on org_members for select using (
  user_id = auth.uid()
  or exists (select 1 from organizations o where o.id = org_id and o.owner_id = auth.uid())
);
create policy orgmem_write on org_members for all using (
  exists (select 1 from organizations o where o.id = org_id and o.owner_id = auth.uid())
);

-- projects: owner or org member
create policy projects_rw on projects for all
  using (owner_id = auth.uid() or (org_id is not null and exists (
    select 1 from org_members m where m.org_id = org_id and m.user_id = auth.uid()
  )))
  with check (owner_id = auth.uid() or (org_id is not null and exists (
    select 1 from org_members m where m.org_id = org_id and m.user_id = auth.uid()
  )));

-- project-scoped children: gate via owns_project()
create policy floor_plans_rw   on floor_plans   for all using (owns_project(project_id)) with check (owns_project(project_id));
create policy rooms_rw         on rooms         for all using (owns_project(project_id)) with check (owns_project(project_id));
create policy concepts_rw      on design_concepts for all using (owns_project(project_id)) with check (owns_project(project_id));
create policy boq_items_rw     on boq_items     for all using (owns_project(project_id)) with check (owns_project(project_id));
create policy boq_sum_rw       on boq_summaries for all using (owns_project(project_id)) with check (owns_project(project_id));
create policy proposals_rw     on proposals     for all using (owns_project(project_id)) with check (owns_project(project_id));
create policy render_jobs_rw   on render_jobs   for all using (owns_project(project_id)) with check (owns_project(project_id));

-- DNA: owner only
create policy dna_rw on designer_dna_profiles for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy dna_assets_rw on dna_training_assets for all
  using (exists (select 1 from designer_dna_profiles d where d.id = dna_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from designer_dna_profiles d where d.id = dna_id and d.owner_id = auth.uid()));

-- subscriptions: owner only
create policy subs_rw on subscriptions for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- reference data: read-only to any authenticated user; writes via service role (bypasses RLS)
create policy markets_read on market_profiles for select using (auth.role() = 'authenticated');
create policy rates_read   on rate_libraries  for select using (auth.role() = 'authenticated');
