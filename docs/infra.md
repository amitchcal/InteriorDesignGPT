# Infrastructure & hosting

> Status: **DECIDED** — host on Vercel (white-label custom domains). Portable to
> Cloud Run / AWS / Azure later with no rewrite. Figures are current-as-of mid-2026
> and should be re-verified at provisioning time.

## Decision: Vercel

**Hosting platform = Vercel.** Chosen for zero-ops deployment and, decisively,
**near-built-in white-label custom domains** — a premium-tier selling point for
designers who want the app on their own branded domain. The stack is deliberately
Vercel-agnostic (plain Next.js + managed Supabase + HTTP provider APIs), so if
cost-at-scale or India data residency later dominates, the app moves to Cloud Run
or a VM **without a rewrite**.

### Why white-label tipped it
- **Your SaaS domain** (e.g. `app.yourbrand.com`): supported on every plan; SSL
  auto-issued and renewed.
- **Each designer's own domain** (e.g. `studio-sharma.com` → your app):
  - Wildcard subdomains (`*.yourapp.com`) on all plans.
  - Per-tenant custom domains added **programmatically via the Vercel SDK/REST
    API**, with automatic SSL per tenant (Pro plan; soft limit ~100k domains/project).
  - Flow: your code calls the Vercel domains API to attach the tenant domain →
    designer adds a DNS record (CNAME/A) or points nameservers → Vercel verifies
    and issues the cert. Tenant resolved at the edge in Next.js middleware
    (`host` header → tenant lookup).
  - Enterprise-only extras (not needed for v1): per-tenant preview URLs, custom
    SSL certificates.

### Registrar ≠ host
Buy domains anywhere (GoDaddy, Namecheap, Hostinger registrar). That is
independent of hosting. Buying a domain at GoDaddy does **not** mean hosting at
GoDaddy.

## Background jobs (architecture requirement)
Render dispatch+poll, floor-plan vision parse, and PDF generation are
long-running and can exceed serverless function timeouts. Provision a
**queue + worker** (e.g. Inngest / Trigger.dev / Supabase Edge Functions, or a
small always-on worker). This is the only persistent process in the stack and
must be wired into Tasks 5 (parse), 9 (PDF), and 10 (render). On an always-on
host this is native; on Vercel use a background-job service.

## Bill of materials
| Layer | Service | Notes |
|---|---|---|
| App hosting | **Vercel** | Next.js; per-seat Pro; white-label domains via SDK |
| DB + Auth + Storage | Supabase | Pro from ~$25/mo; provision **ap-south (Mumbai)** for India |
| AI reasoning | Claude API | pay-per-token; dominant variable cost |
| Render | Generative render API | pay-per-render; behind `RenderProvider` |
| Background jobs | Queue/worker service | for parse / render-poll / PDF |
| Payments | Stripe + Razorpay | ~2–3% fees; no fixed server |
| CDN | In front of Supabase Storage | renders/plans are media; avoid egress overage |

No GPU, no VM, no Kubernetes to size. The end customer (designer) needs only a
browser.

## Cost at scale (directional)
Per-project AI+render ≈ ₹20–45 (Claude ~$0.20–0.30 + render $0.05–0.30 + a few
cents storage).

| Stage | Designers / projects-mo | Fixed infra | Variable (AI+render) |
|---|---|---|---|
| Launch | ~100 / ~2,000 | ~$50–70/mo | ~$700–1,000/mo |
| Growth | ~1,000 / ~20,000 | ~$60–200/mo | ~$7K–10K/mo |
| Scale | ~10,000 / ~200,000 | ~$200–600/mo | ~$70K–100K/mo |

## Cost levers (apply from day 1)
- **Prompt caching** — engine system prompts are large + stable → up to 90% off
  cached input. Biggest single saver.
- **Haiku routing** — validation gate already on Haiku; keep cheap tasks off Sonnet.
- **Batch API** — 50% off for non-interactive work (e.g. DNA training).
- **CDN on Storage** — serve renders/plans via CDN to dodge egress overage.

## India notes
- Supabase region: **ap-south (Mumbai)** for low latency to Indian designers.
- Claude: keep **global routing** (default); US-only `inference_geo` adds a 1.1x
  multiplier you don't need.

## Portability (exit path, no rewrite)
- **GCP Cloud Run** — cleanest container fit; scales to zero.
- **AWS** — Amplify, ECS/Fargate/App Runner, or OpenNext→Lambda.
- **Azure** — App Service / Container Apps.
- **Hostinger** — managed Node.js (Business/Cloud) or VPS only; **not** shared hosting.
- **Avoid:** any traditional shared/cPanel hosting — cannot run a dynamic
  (SSR + API routes) Next.js app.
Moving hosts costs the per-tenant domain automation (which Vercel gives for free)
plus self-managed SSL/builds; the app code itself is portable.
