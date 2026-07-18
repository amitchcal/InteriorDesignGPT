-- 0016_white_label.sql
--
-- White-label (docs/infra.md "why white-label tipped it"). Three pieces:
--   1. Per-org branding columns on `organizations`.
--   2. `org_domains` — a studio's own hostname(s), attached to an org.
--   3. `resolve_tenant(host)` — the edge resolver. The proxy/layout runs BEFORE
--      auth on a client's first visit to a custom domain, so this is a
--      security-definer function granted to `anon`: it returns ONLY public
--      branding, and ONLY for a live ('active') domain.
--
-- Design notes:
--   * Colors are stored as text (hex, e.g. '#4F46E5'); the app validates the
--     format and derives a readable foreground. Postgres stays format-agnostic.
--   * Logos live in a PUBLIC `brand-assets` bucket — a logo is public brand
--     material shown to un-authed clients, so signed URLs would be pointless.
--     Write is still gated to the org's owner by the path's first segment.

-- ---------------------------------------------------------------------------
-- 1. Branding columns on organizations. All nullable — an org with no branding
--    falls back to the app default (handled in code, not here).
-- ---------------------------------------------------------------------------
alter table organizations
  add column if not exists brand_name    text,
  add column if not exists logo_path     text,   -- object path in brand-assets
  add column if not exists primary_color text,   -- hex, e.g. '#4F46E5'
  add column if not exists accent_color  text;   -- hex

-- ---------------------------------------------------------------------------
-- 2. org_domains — hostname -> org. One org can have many; a hostname is global
--    (a domain can back exactly one tenant), hence UNIQUE.
--
--    status lifecycle:
--      pending  — attached, DNS not yet verified (not resolvable)
--      active   — verified and serving (resolvable by resolve_tenant)
--      error    — provider/DNS rejected it (not resolvable)
-- ---------------------------------------------------------------------------
create table if not exists org_domains (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  hostname     text not null unique
                 check (hostname = lower(hostname) and hostname !~ '\s' and hostname not like '%/%'),
  status       text not null default 'pending'
                 check (status in ('pending','active','error')),
  verification jsonb,   -- provider-returned DNS records the owner must set
  created_at   timestamptz not null default now()
);

create index if not exists org_domains_org_idx on org_domains (org_id);

alter table org_domains enable row level security;

-- Only the org owner reads/writes its domains. is_org_owner (0006) is
-- security-definer, so no recursion.
drop policy if exists org_domains_read  on org_domains;
drop policy if exists org_domains_write on org_domains;

create policy org_domains_read on org_domains for select
  using (is_org_owner(org_id));

create policy org_domains_write on org_domains for all
  using (is_org_owner(org_id))
  with check (is_org_owner(org_id));

grant select, insert, update, delete on org_domains to authenticated;

-- ---------------------------------------------------------------------------
-- 3. resolve_tenant — host header -> public branding, for a live domain only.
--    SECURITY DEFINER so it sees past RLS (the caller is anonymous). It exposes
--    nothing but branding, and nothing for pending/error domains.
-- ---------------------------------------------------------------------------
create or replace function resolve_tenant(host text)
returns table (
  org_id        uuid,
  brand_name    text,
  logo_path     text,
  primary_color text,
  accent_color  text
)
language sql stable security definer set search_path = public as $$
  select o.id, coalesce(o.brand_name, o.name), o.logo_path, o.primary_color, o.accent_color
  from org_domains d
  join organizations o on o.id = d.org_id
  where d.hostname = lower(host) and d.status = 'active'
  limit 1;
$$;

revoke execute on function resolve_tenant(text) from public;
grant execute on function resolve_tenant(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. brand-assets bucket — PUBLIC (logos are shown to un-authed clients).
--    Path convention: <org_id>/<file>. Write/delete gated to that org's owner.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('brand-assets','brand-assets', true)
on conflict (id) do nothing;

drop policy if exists brand_read   on storage.objects;
drop policy if exists brand_write  on storage.objects;
drop policy if exists brand_update on storage.objects;
drop policy if exists brand_delete on storage.objects;

-- Public bucket => anyone reads (that is the point of a public logo).
create policy brand_read on storage.objects for select
  using ( bucket_id = 'brand-assets' );

-- Only the owner of the org named by the first path segment may write it.
create policy brand_write on storage.objects for insert
  with check (
    bucket_id = 'brand-assets'
    and is_org_owner(((storage.foldername(name))[1])::uuid)
  );
create policy brand_update on storage.objects for update
  using (
    bucket_id = 'brand-assets'
    and is_org_owner(((storage.foldername(name))[1])::uuid)
  );
create policy brand_delete on storage.objects for delete
  using (
    bucket_id = 'brand-assets'
    and is_org_owner(((storage.foldername(name))[1])::uuid)
  );
