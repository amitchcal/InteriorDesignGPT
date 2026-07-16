# API contracts

All routes are Next.js route handlers under `/app/api`. Every handler:
**auth check → zod input validation → work → typed JSON response.** Auth is the
Supabase session; reject with 401 if absent. Errors use the shape below.

## Error shape (all endpoints)

```json
{ "error": { "code": "validation_error", "message": "Human-readable, interface voice.", "fields": { "budget_total": "required" } } }
```
Codes: `unauthorized` (401), `validation_error` (422), `not_found` (404),
`quota_exceeded` (402), `provider_error` (502), `server_error` (500).

---

### POST /api/projects
Create a project. Body:
```json
{ "name":"Sharma 3BHK", "market_code":"IN", "intake": { /* client_brief, preferences, cultural_overrides */ } }
```
→ `201 { "id":"uuid", "status":"draft" }`. Enforces subscription quota; over quota → 402.

### POST /api/projects/:id/floorplan/parse
Body: `{ "source_url":"https://.../plan.pdf" }`
Runs Claude vision. → `200 { "floor_plan_id":"uuid", "parsed": { "rooms":[{ "name","length","width","ceiling_ht","unit","doors","windows","confidence":0.0 }] }, "confirmed": false }`
Low/missing confidence rooms are still returned with `confidence` so the UI can prompt correction. Parse failure → `502 provider_error` (UI falls back to manual entry).

### PUT /api/projects/:id/floorplan/confirm
Body: `{ "floor_plan_id":"uuid", "rooms":[ /* user-corrected rooms */ ] }`
Writes `rooms`, sets `confirmed=true`. → `200 { "ok": true }`

### POST /api/projects/:id/validate
Runs the Validation gate (haiku). → `200`
```json
{ "ok": false, "missing":["budget_total"], "cultural_confirmations":["vastu"] }
```
Engines must refuse to run while `ok=false`.

### POST /api/projects/:id/concept
Runs Concept Engine. → `201 { "version":1, "concept": { /* concept schema */ } }`
Pre-req: latest validate `ok=true`. Otherwise `422 validation_error`.

### POST /api/projects/:id/boq
Runs BOQ Engine over latest concept + fetched rate_library. → `201`
```json
{ "version":1, "summary": { "total_minor":0, "currency":"INR", "budget_delta_minor":0, "value_engineering":[] }, "item_count": 37 }
```

### POST /api/projects/:id/proposal
Runs Proposal Engine, renders PDF to Storage. → `201 { "version":1, "pdf_url":"https://..." }`

### POST /api/projects/:id/render
Body: `{ "room":"Living", "brief": { /* render_brief from concept */ } }`
Dispatches via `RenderProvider`. → `202 { "render_job_id":"uuid", "status":"queued" }`
Poll: **GET /api/render/:jobId** → `{ "status":"done", "output_url":"https://..." }`

### GET /api/projects/:id/export/boq.xlsx
Streams an XLSX of the latest BOQ. → `200` (binary).

### POST /api/dna
Body: `{ "name":"Amit signature", "asset_urls":["..."] }`
Runs DNA Engine. → `201 { "dna_id":"uuid", "dna": { /* dna schema */ } }`

### GET /api/markets
→ `200 { "markets":[{ "market_code":"IN","display_name":"India","currency":{...} }] }`
Reads active `market_profiles`. Used to drive intake UI units/currency/labels.

### POST /api/billing/checkout
Body: `{ "plan":"professional", "market_code":"IN" }`
Selects `PaymentProvider` by market (Razorpay for IN, Stripe otherwise).
→ `200 { "checkout_url":"https://..." }`
