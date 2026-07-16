# CLAUDE.md — Interior AI build brief

> Read this first, every session. It is the source of truth for stack,
> conventions, and the build sequence. Specs live in `/docs`. Build tasks
> live in `/docs/build-tasks.md` — run them in order.

## Product

AI design-operations agent for interior designers. A designer uploads a floor
plan + brief; the app returns a design concept, a quantified & costed BOQ, a
client proposal, and a render — **localized per market** (India first, US next).

**Positioning:** "Coohom and Foyr render your design. We cost it, quantify it,
and write the proposal — in your style, for your market."

## Architecture principle: own the brain, rent the muscle

- **BUILD:** reasoning/agent engines, localized cost intelligence (rate
  libraries), Designer-DNA. This is the moat.
- **RENT (behind swappable interfaces):** render, catalog, floor-plan vision
  parse, payments. Never build these from scratch.
- **DON'T BUILD:** a render engine, a million-model catalog, a drag-and-drop CAD
  editor. Stay **floor-plan-in, artefacts-out**.

## Non-negotiables (do not violate without an explicit instruction)

1. **`market_profile` drives everything geographic.** No country logic is
   hardcoded in engines — currency, units, tax, standards, and cultural rules
   (vastu/feng-shui/none) are all read from `market_profiles`. Adding a market =
   add a profile row + a rate library, never edit engine code.
2. **RLS on every user-facing table**, keyed to `auth.uid()` via project/org
   ownership. Reference tables (`market_profiles`, `rate_libraries`) are
   read-only to authenticated users, written only by service role.
3. **Advisory framing.** Every BOQ/proposal output states rates are directional
   estimates needing local verification, and that working drawings require
   licensed professional sign-off. Never present an invented brand price as fact.
4. **Engines are separate, single-purpose calls** (Concept, BOQ, Proposal, DNA,
   Validation). Don't merge them. Each has a written prompt in `/docs/prompts`.
5. **Money is integer minor units** in the DB (paise/cents); format at the edge
   from `market_profile.currency`. Never store floats for money.

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript (strict)**
  — *Deviation from the original spec's Next 14, approved at Task 1 (2026-07-16):
  Next 14 is out of active support. Two consequences to remember: the file
  convention is `proxy.ts`, **not** `middleware.ts` (Next 16 renamed it), and
  `cookies()`/`headers()`/route `params` are **async** — always `await` them.*
- **Tailwind v4** + shadcn/ui — *v4, not v3: config is CSS-first in
  `app/globals.css` (`@theme`), there is no `tailwind.config.js`.*
- Supabase: Postgres + Auth + Storage + RLS
- Claude API for engines:
  - `claude-sonnet-4-6` — Concept, BOQ, Proposal, DNA engines
  - `claude-haiku-4-5` — Validation/intake gate (cheap)
  - `claude-opus-4-8` — optional escalation for hard design reasoning
  - Floor-plan parse uses Claude vision (`claude-sonnet-4-6`)
- i18n: `next-intl`, all copy externalized from day 1
- Payments: `PaymentProvider` interface → Stripe (global) + Razorpay (IN)
- **Hosting: Vercel** (decided — see `docs/infra.md`). White-label custom domains
  per designer via the Vercel SDK/REST API (wildcard `*.yourapp.com` + per-tenant
  domains with auto SSL); tenant resolved in Next.js middleware from the `host`
  header. Stack is host-agnostic — portable to Cloud Run/AWS/Azure with no rewrite.
- **Background jobs:** long-running work (render poll, vision parse, PDF) runs in a
  queue/worker (not inline in a request) to avoid serverless timeouts. Wire into
  Tasks 5, 9, 10. See `docs/infra.md`.
- **Render: `RenderProvider` interface → `GenerativeRenderProvider`**, a generic
  sketch/photo-to-render HTTP adapter configured by env (see below). Vendor is
  swappable; no vendor name is hardcoded in business logic.

## Directory conventions

```
/app                 Next.js routes (App Router)
  /api/...           route handlers (see /docs/api-contracts.md)
  /(app)/...         authed UI
  /admin/rates       rate-library admin (already prototyped)
/lib
  /engines           one file per engine; loads prompt text from /docs/prompts
  /providers         render | catalog | payment adapters (interface + concrete)
  /market            getMarketProfile(), getRates()
  /supabase          server + browser clients
/supabase/migrations runnable DDL (0001_init.sql is the schema of record)
/docs                specs: api-contracts.md, prompts/, build-tasks.md
/messages            next-intl locale files (en-IN, en-US, ...)
```

## Provider interfaces (shape)

```ts
interface RenderProvider  { dispatch(b: RenderBrief): Promise<RenderJob> }
interface CatalogProvider { search(q: CatalogQuery): Promise<CatalogItem[]> }
interface PaymentProvider { checkout(p: Plan, market: string): Promise<Session> }
```

Concrete provider is selected by env/`market_code`, never hardcoded in a route.

## Required env (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only
ANTHROPIC_API_KEY=
# Render (generative provider — fill with chosen vendor's values)
RENDER_API_URL=
RENDER_API_KEY=
RENDER_PROVIDER=generative          # selects GenerativeRenderProvider
# Payments
STRIPE_SECRET_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
# Hosting / white-label domains
VERCEL_TOKEN=                        # for programmatic per-tenant custom domains
VERCEL_PROJECT_ID=
# Background jobs (queue/worker)
JOB_QUEUE_URL=
```

## Conventions

- TypeScript strict; no `any` in committed code.
- All Claude calls go through `/lib/engines/*`; never call the API inline in a route.
- Validate every engine's JSON output against a zod schema before persisting.
- Every route handler: auth check → input validation (zod) → work → typed response.
- Errors are typed and user-facing copy is in the interface's voice (see api-contracts).

## How to work

Run tasks from `/docs/build-tasks.md` **in order**. Each task lists its files,
dependencies, and acceptance criteria. Don't start a task until its dependencies
are merged. After each task, confirm acceptance criteria before moving on.
