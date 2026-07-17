# Build tasks

Run **in order**. Each task is self-contained: it names its files, the **stories
it delivers** (see `docs/user-stories.md`), dependencies, and acceptance
criteria. Acceptance criteria are tagged **[M]** (Must) or **[S]** (Should) so a
Must and a Should are never conflated. Don't start a task until its dependencies
are merged. Read `CLAUDE.md`, `docs/api-contracts.md`, `docs/user-stories.md`,
and the relevant `docs/prompts/*` before coding.

> Priority rule: every **[M]** criterion must pass before the task is "done."
> **[S]** criteria are in v1 scope but may be split into a follow-up commit if
> needed — deferring one is a conscious call, logged in the PR, never silent.

---

## Task 1 — Scaffold
**Delivers:** E5-4 (Must) · foundation for all.
**Goal:** Boot the app shell with conventions enforced.
**Create:** Next.js 14 (App Router) + TS strict; Tailwind + shadcn/ui;
`next-intl` with `en-IN` + `en-US` message files (all UI copy externalized);
`/lib/supabase` server+browser clients; `.env.local.example` with every var from
CLAUDE.md; empty `/lib/providers`, `/lib/engines`, `/lib/market`.
**Depends on:** none.
**Acceptance:**
- [M] App runs; `tsc --noEmit` passes.
- [M] No UI copy string literals outside `/messages` (E5-4).
- [M] Switching locale switches rendered copy.

## Task 2 — Auth + RLS
**Delivers:** E5-1 (Must).
**Goal:** Accounts + org membership behind RLS.
**Create:** Supabase auth (email + OAuth); create a `profiles` row on first
login; org + `org_members` CRUD for owners; middleware rejecting unauthenticated
API calls with `401 unauthorized`.
**Depends on:** 1; migrations 0001 applied.
**Acceptance:**
- [M] Sign up creates a profile; protected routes 401 when logged out (E5-1).
- [M] User B cannot read User A's rows (verify against table RLS) (E5-1).
- [M] Org owner can add/remove a member.

## Task 3 — Localization core
**Delivers:** E6-1, E6-2 (Must); E1-4 backing.
**Goal:** Stand up the moat factory **before** any engine.
**Create:** apply `0001`–`0004`; confirm `0002_seed_markets.sql` and
`0003_seed_rates_in.sql` loaded; `/lib/market/getMarketProfile(code)` and
`getRates(code,{tier?,region?})`; `GET /api/markets`.
**Depends on:** 2.
**Acceptance:**
- [M] `getMarketProfile('IN')` returns the config; `/api/markets` lists IN + US (E6-2).
- [M] `getRates('IN')` returns 64 rows (E6-1).
- [M] Re-running the rate seed upserts (no duplicates) — `UNIQUE(market_code,item_code)` holds.
- [M] Storage buckets exist and are **private** (0004 applied).

## Task 4 — Project + intake
**Delivers:** E1-3, E1-4 (Must); E5-3 (Must, quota enforcement).
**Goal:** Create projects with a market-driven intake form.
**Create:** `POST /api/projects` (enforces subscription quota → 402 over limit);
`projects`/`rooms` access; intake form whose units, currency symbol, tier
options, and cultural-rule toggles all render from the selected `market_profile`;
persist `intake`.
**Depends on:** 3.
**Acceptance:**
- [M] Market IN → ₹/feet/vastu-toggle; US → $/feet/feng-shui-off (E1-4).
      (Corrected 2026-07-17: this said "IN → ₹/metric". The IN profile shipped
      `units:"metric"` while 51 of its 64 rate rows are priced per sqft/rft and
      `area_basis` is carpet_area — measured in square feet. Under "metric" the
      BOQ would compute m² and cost it at ₹/sqft: every quote wrong by 10.76x.
      Fixed in 0010 by data, not engine code. What the criterion is really
      testing — that units come from the profile and nothing is hardcoded —
      still holds; only IN's own value was wrong.)
- [M] Mandatory brief fields captured and persisted to `projects.intake` (E1-3).
- [M] Creating beyond plan quota returns `402 quota_exceeded` (E5-3).

## Task 5 — Floor-plan vision parse (+ fallback)
**Delivers:** E1-1, E1-2, E1-5 (Must).
**Goal:** Extract rooms from a plan, with a correction loop and manual fallback.
**Create:** floor-plan upload to the **private `floor-plans` bucket** at
`<uid>/<project_id>/...`; `POST /floorplan/parse` (Claude vision → `parsed` with
per-room `confidence`); confirm/correct UI pre-filling rooms with every dimension
editable; `PUT /floorplan/confirm` writing `rooms`; an **"enter manually"** path
that skips parse entirely. Parse is best-effort — never block on it.
**Depends on:** 4.
**Acceptance:**
- [M] A clean plan pre-fills rooms; user can edit any dimension before confirm (E1-1, E1-2).
- [M] A failed/messy parse still lets the user proceed via manual entry (E1-5).
- [M] Confirmed rooms land in `rooms` with `confirmed=true`.
- [M] Uploaded files are not readable by another user (storage RLS).

## Task 6 — Validation gate
**Delivers:** E6-3 (Must).
**Goal:** Cheap gatekeeper before expensive engines.
**Create:** `POST /api/projects/:id/validate` using `claude-haiku-4-5` and the
validation section of `docs/prompts/dna-and-validation.md`; UI surfacing
`missing` fields and asking the user to confirm each `cultural_confirmations`
rule on/off (writing back to `intake.cultural_overrides`).
**Depends on:** 4.
**Acceptance:**
- [M] Missing mandatory fields block progress with a clear message (E6-3).
- [M] Each `default_on` cultural rule (e.g. vastu) is confirmed before concept can run.

## Task 7 — Concept Engine
**Delivers:** E2-1, E2-2, E2-3 (Must); E2-4 (Should).
**Goal:** Generate the design concept + render briefs.
**Create:** `/lib/engines/concept.ts` loading `master.md` + `concept-engine.md`;
zod schema for the output; `POST /api/projects/:id/concept` (refuses if latest
validate `ok=false`); persist versioned `design_concepts`; per-room concept UI.
**Depends on:** 6.
**Acceptance:**
- [M] Validated project returns a concept passing the zod schema (E2-1).
- [M] Clearance issues appear per market standards; cultural trade-offs in `cultural_notes` (E2-2, E2-3).
- [S] Re-running a single room bumps `version` without redoing the project (E2-4).

## Task 8 — BOQ + Cost Engine
**Delivers:** E3-1, E3-2, E3-3, E3-4 (Must); E3-5, E3-6 (Should).
**Goal:** The revenue wedge — quantified, costed, budget-reconciled BOQ.
**Create:** `/lib/engines/boq.ts` (temp 0.2) loading `master.md` + `boq-engine.md`;
fetch rate_library via `getRates`; zod schema; `POST /api/projects/:id/boq`
persisting `boq_items` + `boq_summaries` (money in minor units); rate/brand edit
UI; `GET /export/boq.xlsx`.
**Depends on:** 7.
**Acceptance:**
- [M] Quantities derive from concept; subtotal+tax=total; money stored as minor units, no floats (E3-1, E3-4).
- [M] Rates pulled from the market rate library; market tax applied (E3-2).
- [M] `budget_delta_minor` correct; over-budget returns 3 ranked value-engineering options (E3-3).
- [S] User can edit a line-item rate/brand and the total recomputes (E3-5).
- [S] XLSX export downloads with correct currency formatting (E3-6).

## Task 9 — Proposal Engine + PDF
**Delivers:** E4-1 (Must).
**Goal:** Client-ready proposal document.
**Create:** `/lib/engines/proposal.ts` loading `master.md` + `proposal-engine.md`;
`POST /api/projects/:id/proposal` generating locale-aware copy and rendering a
branded PDF to the **private `proposals` bucket**; persist `proposals`; always
includes the advisory disclaimer.
**Depends on:** 8.
**Acceptance:**
- [M] PDF renders with concept + BOQ total in market currency and the disclaimer present (E4-1).
- [M] `pdf_url` returned; file is private (signed URL to view).

## Task 10 — Render (generative provider)
**Delivers:** E4-2 (Must); E4-3 (Should).
**Goal:** In-app render via a swappable generative adapter.
**Create:** `/lib/providers/render.ts` — `RenderProvider` interface +
`GenerativeRenderProvider` POSTing the brief to `RENDER_API_URL` with
`RENDER_API_KEY`, storing output to the **private `renders` bucket**; selection
by `RENDER_PROVIDER` env; `POST /api/projects/:id/render` (→ 202 + job) and
`GET /api/render/:jobId`; `render_jobs` rows; per-room render brief surfaced in
the concept UI.
**Depends on:** 7.
**Acceptance:**
- [M] Dispatch creates a `render_jobs` row; polling returns `done` + `output_url` (E4-2).
- [M] Swapping `RENDER_API_URL`/key needs **no** route code change; provider failure → `502 provider_error` without crashing the page (E4-2).
- [S] Per-room render brief is viewable/copyable in the UI (E4-3).

## Task 11 — Designer-DNA
**Delivers:** E2-5 (Should).
**Goal:** Style replication wired into Concept.
**Create:** asset upload to the **private `dna-assets` bucket**; `POST /api/dna`
running the DNA engine; persist `designer_dna_profiles` + `dna_training_assets`;
let a project reference a `dna_id`, passed into the Concept Engine call.
**Depends on:** 7.
**Acceptance:**
- [S] Uploading past projects yields a DNA profile; a project using it produces a concept reflecting the DNA's materials/palette over generic style (E2-5).
- [S] `confidence_note` flags small samples (<20 assets).

## Task 12 — Billing + agency hub
**Delivers:** E5-2, E5-3 (Must); E5-5 (Should).
**Goal:** Paid plans and the agency view.
**Create:** `/lib/providers/payment.ts` — `PaymentProvider` interface + Stripe
and Razorpay adapters selected by `market_code`; `POST /api/billing/checkout`;
`subscriptions` with quotas enforced in Task 4's create route; agency project hub
where an org owner sees all members' projects (read via RLS).
**Depends on:** 4, 8.
**Acceptance:**
- [M] IN checkout routes to Razorpay, others to Stripe (E5-2).
- [M] Quota blocks creation at the limit with `402` (E5-3).
- [S] Org owner sees members' projects; a viewer cannot edit them (E5-5).

---

## Definition of done (whole v1)
All **[M]** criteria across Tasks 1–12 pass, plus the scheduled **[S]** items
(E2-4, E3-5, E3-6, E4-3, E5-5, and E6-4 via the prototyped admin screen). A
designer can: sign up → create an IN project → upload/confirm a floor plan (or
enter manually) → pass validation → generate concept → generate a costed,
budget-reconciled BOQ → export XLSX → generate a proposal PDF → render a room →
(optionally) train and apply Designer-DNA → subscribe. Adding the US market
requires only a `market_profile` row + a `rate_library` seed + Stripe — **no
engine code change** (E6-1).

Deferred (not v1): E1-6 (may land as Task 5 polish), E1-7, E1-8, E2-6, E3-7,
E3-8, E4-4, E4-5, E5-6, E6-5, E6-6.
