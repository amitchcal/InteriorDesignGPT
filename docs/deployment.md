# Deployment

The app is local-only today (Docker Supabase). Going live is **not just creating
the Vercel project** — Vercel hosts the web app, but three things live outside
it: the database, the background worker, and the provider keys. Here is
everything that remains, in order.

The code itself is deploy-ready: no hardcoded hosts (URLs come from env or the
request origin), `pdfkit` externalized for bundling, Node pinned (`engines`), and
the build gated by the test suite (`prebuild`).

---

## A. Hosted Supabase (database + auth + storage)

1. Create a Supabase project. **Region: ap-south-1 (Mumbai)** for India latency
   (docs/infra.md).
2. From the repo: `supabase link --project-ref <ref>`, then `supabase db push`.
   This applies all 15 migrations — which also **seed** markets + the 64 IN
   rates, and **create** the four private storage buckets with their policies.
   Nothing else to seed by hand.
3. Copy three values from Project Settings → API:
   `Project URL`, `anon` key, `service_role` key.
4. **Auth → URL Configuration:** set `Site URL` and add Redirect URLs for the
   Vercel domain, including `https://<domain>/auth/callback` (OAuth + email
   confirm land there). If keeping GitHub sign-in, create a GitHub OAuth app and
   configure the GitHub provider in Supabase; otherwise email/password works as-is.

**Verify:** the integration suite can run against it —
`TEST_DATABASE_URL=<pooler connection string> npm run test:int`. 24 green =
migrations, RLS, grants, seed all correct on the hosted DB.

---

## B. Vercel (the web app)

1. Import the repo, framework auto-detects Next.js.
2. **Environment Variables** (Project Settings → Environment Variables):
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY       # server only — never a NEXT_PUBLIC_ var
   ANTHROPIC_API_KEY
   RENDER_API_URL                  # https://queue.fal.run/fal-ai/flux/dev
   RENDER_API_KEY
   RENDER_API_AUTH_SCHEME=Key
   RENDER_PROVIDER=generative
   STRIPE_SECRET_KEY               # when billing goes live
   RAZORPAY_KEY_ID
   RAZORPAY_KEY_SECRET
   ```
3. Deploy. Vercel runs `npm run build`, and npm runs `prebuild` first — the unit
   suite + `tsc`. **A failing test or type error fails the deploy** (verified).

That is the whole "Vercel project" part. But the app is only half-working until C.

---

## C. The background worker (a SEPARATE always-on host — NOT Vercel)

Concept, BOQ, Proposal, and DNA run 1–4 minutes each, on a queue, in a
persistent process. Vercel is serverless and can't run it. **Without the worker,
those jobs enqueue and never complete.**

Host it on Railway / Render / Fly.io / a small always-on VM:

1. Deploy the same repo.
2. Start command: `npm run worker:prod` (uses the platform's injected env; the
   local `npm run worker` reads `.env.local` instead).
3. Env vars it needs: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `ANTHROPIC_API_KEY`, `RENDER_*`. Same hosted Supabase as Vercel.
4. It's stateless and safe to run more than one — `claim_job` uses
   `FOR UPDATE SKIP LOCKED` (regression-tested). Start with one.

**Verify:** enqueue a concept in the deployed app; the worker log should show it
claimed and done, and the concept should appear.

---

## D. Keys that unlock features (not blockers for a first deploy)

- **fal.ai** — top up ~$5. Renders return `502` until the account has balance;
  auth is already confirmed working.
- **Stripe / Razorpay** — add the keys, then finish the payment webhook. It ships
  as a documented `501` stub at `app/api/billing/webhook/route.ts`; wire up
  signature verification and call `applyPlanUpgrade` (the upgrade logic is built
  and tested). Until then, checkout starts (`checkout_url`) but the plan upgrade
  doesn't apply automatically.

---

## E. Optional, later (docs/infra.md)

- CDN in front of Supabase Storage for renders/plans, to avoid egress overage at
  scale.
- Prompt caching is already used on the engines (biggest cost lever); no action.

---

## What is NOT left

- Migrations/seed: `supabase db push` does it all.
- Any code change to add the US market: a `market_profile` row + a rate seed +
  Stripe — no engine code (verified end to end).
- Build hardening: tests gate the build already.
