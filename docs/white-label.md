# White-label

Lets a studio present the app as **their own** product to their clients — their
name, logo, colours, on their own domain. A premium-tier lever (docs/infra.md).

## The three layers

**1. Branding (per org).** `organizations` gained `brand_name`, `logo_path`,
`primary_color`, `accent_color` (migration 0016). The owner sets them at
`/agency/branding`. Logos live in a **public** `brand-assets` bucket (a logo is
shown to un-authed clients, so signed URLs would be pointless); writes are gated
to the org owner by the path's first segment (`<org_id>/…`).

**2. Colour application.** The root layout resolves the request's branding and
injects `:root { --primary … }` overrides server-side (no unbranded flash).
`readableForeground` picks black/white text off the brand colour at the WCAG
contrast crossover (luminance 0.179), so the accent stays legible. Only validated
hex reaches the CSS — a malformed stored value is ignored, never emitted.

**3. Custom domains → tenant resolution.** A studio adds `studio.example.com` at
`/agency/branding`. `org_domains` maps hostname → org (hostname is globally
UNIQUE — one domain backs one tenant). On a request, the layout calls the
`resolve_tenant(host)` RPC. It is **security-definer, anon-callable**, returns
**only** public branding, and **only** for an `active` domain — so a client
hitting the studio's domain gets the studio's brand *before authenticating*,
without exposing the domains table.

Lifecycle: `pending` (added, DNS not verified) → `active` (verified, resolvable)
/ `error`. A domain never resolves until verified.

## Domain provider (swappable, like RenderProvider)

`lib/providers/domains.ts`, chosen by env:

- **VercelDomainProvider** — `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` set. `attach`
  registers the domain via the Vercel API and returns Vercel's verification
  records; `verify` re-checks; `remove` detaches.
- **ManualDomainProvider** — no token. `attach` returns the CNAME to set
  (`cname.vercel-dns.com`); `verify` does a live `resolveCname`/`resolve4`
  lookup and flips to `active` when the domain points at us.

Branding works with or without the Vercel vars; only the auto-attach convenience
depends on them.

## API

- `PATCH /api/orgs/:id/branding` — set branding (owner only, RLS).
- `GET|POST /api/orgs/:id/domains` — list / add.
- `POST /api/orgs/:id/domains/:domainId/verify` — re-check DNS.
- `DELETE /api/orgs/:id/domains/:domainId` — detach.

## Tests

- Unit (`test/unit/branding.test.ts`): contrast crossover, hex/hostname schema
  validation, `brandingCssVars` (emits nothing unbranded, ignores bad hex),
  provider selection, manual-attach records.
- Integration (`test/integration/white-label.test.ts`): `org_domains` RLS (owner
  writes, non-owner denied, hostname uniqueness), `resolve_tenant` (nothing while
  pending, branding once active — to an anon caller, name fallback, unknown host),
  `brand-assets` bucket is public.
