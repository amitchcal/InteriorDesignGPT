# User stories — MoSCoW by epic

Source of truth for scope and priority. Each story has an ID (`E<epic>-<n>`) so
build tasks can trace to it. Priority: **Must** / **Should** / **Could** /
**Won't (v1)**. Reconciled with the final architecture — localization and
vendor-abstraction are **Must**, since the whole global thesis rests on them.

> How this maps to build: `docs/build-tasks.md` implements these stories in
> sequence. Each task header lists the story IDs it delivers, and each
> acceptance criterion is tagged `[M]`/`[S]` so a Must and a Should are never
> conflated inside one task. Could/Won't items are listed here but not built in v1.

---

## Epic 1 — Intake & floor plan
| ID | Priority | Story |
|----|----------|-------|
| E1-1 | **Must** | Upload a floor plan (PDF/JPG/PNG); vision parse into rooms/dimensions. |
| E1-2 | **Must** | Confirm/correct detected dimensions before anything downstream runs. |
| E1-3 | **Must** | Enter the mandatory brief (budget, market, ceiling height, finish tier). |
| E1-4 | **Must** | Select market; all units/currency/tax/standards follow `market_profile`. |
| E1-5 | **Must** | Enter rooms manually when parsing fails or is skipped (fallback path). |
| E1-6 | Should | Upload reference/inspiration images so the AI matches client taste. |
| E1-7 | Could | Import DWG/CAD. |
| E1-8 | Won't (v1) | Auto-detect from a phone photo of a printed plan. |

## Epic 2 — Concept generation
| ID | Priority | Story |
|----|----------|-------|
| E2-1 | **Must** | Generate a room-by-room concept from the brief. |
| E2-2 | **Must** | Flag ergonomic/clearance issues using the market's standards. |
| E2-3 | **Must** | Validate active cultural rules (vastu/feng-shui/none) with conflict alerts + compliant alternatives. |
| E2-4 | Should | Regenerate a single room without redoing the whole project. |
| E2-5 | Should | Train and apply a Designer-DNA profile from past projects. |
| E2-6 | Won't (v1) | Real-time multi-user collaborative editing. |

## Epic 3 — BOQ & cost (revenue wedge)
| ID | Priority | Story |
|----|----------|-------|
| E3-1 | **Must** | Auto-generate a BOQ with quantities derived from the concept. |
| E3-2 | **Must** | Cost from the market's rate library with the market's tax applied. |
| E3-3 | **Must** | Reconcile against budget; if over, return ranked value-engineering options. |
| E3-4 | **Must** | Output money in the market's currency (minor units in DB). |
| E3-5 | Should | Edit line-item rates/brands so the BOQ matches the designer's real vendors. |
| E3-6 | Should | Export the BOQ to XLSX/PDF. |
| E3-7 | Could | Maintain a personal rate library that overrides market defaults. |
| E3-8 | Won't (v1) | Live vendor-price API integration. |

## Epic 4 — Proposal & render
| ID | Priority | Story |
|----|----------|-------|
| E4-1 | **Must** | Generate a branded, locale-aware client proposal as a PDF. |
| E4-2 | **Must** | Render a room via an abstracted `RenderProvider` (generative, swappable). |
| E4-3 | Should | Get a per-room render brief to paste into external tools. |
| E4-4 | Could | In-app refinement of a generated render. |
| E4-6 | Should | 360° VR walkthrough: generate a 360° panorama per room (behind a swappable `Pano360Provider`) and let the client explore it in-browser, on phone (gyroscope), and in a headset browser via WebXR. Premium/white-label upsell. Fast-follow after core v1. |
| E4-5 | Won't (v1) | Full auto-3D / SketchUp / Blender pipeline. |
| E4-7 | Won't (v1) | Free-roam navigable 3D VR (true walk-through requiring real 3D geometry + a furniture-model catalog) — contradicts the rent-the-muscle scope; revisit only as a funded track. |

## Epic 5 — Account, billing, ops
| ID | Priority | Story |
|----|----------|-------|
| E5-1 | **Must** | Sign up and manage projects (saved, RLS-protected). |
| E5-2 | **Must** | Subscribe via abstracted `PaymentProvider` (Stripe global, Razorpay IN). |
| E5-3 | **Must** | Enforce per-plan project quotas. |
| E5-4 | **Must** | All UI copy externalized for i18n. |
| E5-5 | Should | Agency hub: an org owner sees all designers' projects. |
| E5-6 | Could | Read-only client share link. |

## Epic 6 — Localization platform
| ID | Priority | Story |
|----|----------|-------|
| E6-1 | **Must** | Add a market by adding a `market_profile` + `rate_library` — no engine code change. |
| E6-2 | **Must** | Engines read every geographic assumption from `market_profile`. |
| E6-3 | **Must** | Validation gate blocks expensive engines until mandatory inputs are present. |
| E6-4 | Should | Admin UI to add/edit/delete rate-library items (prototyped: `rate-library-admin.html`). |
| E6-5 | Should | Version rate libraries. |
| E6-6 | Could | Community-contributed regional rate corrections. |

---

## v1 cut line
**In v1:** every **Must** + the Shoulds explicitly scheduled in build tasks
(E1-6, E2-4, E2-5, E3-5, E3-6, E4-3, E5-5, E6-4). **Fast-follow (post-core-v1)
Should:** E4-6 (360° VR walkthrough) — a premium/white-label upsell that plugs
into the render abstraction; scheduled as its own task once core v1 is stable.
**Deferred:** all Could/Won't (incl. E4-7 true 3D VR), plus E3-7, E5-6, E6-5,
E6-6. Deferring a Should is a conscious call — it is never silently promoted into
a Must.
