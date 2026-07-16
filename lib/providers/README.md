# /lib/providers

Rented muscle, behind swappable interfaces. The concrete provider is selected by
env or `market_code` — **never hardcoded in a route**, and no vendor name appears
in business logic.

```ts
interface RenderProvider  { dispatch(b: RenderBrief): Promise<RenderJob> }
interface CatalogProvider { search(q: CatalogQuery): Promise<CatalogItem[]> }
interface PaymentProvider { checkout(p: Plan, market: string): Promise<Session> }
```

| File | Task | Selection |
|---|---|---|
| `render.ts` | 10 | `RENDER_PROVIDER` env → `GenerativeRenderProvider` |
| `payment.ts` | 12 | `market_code` → Razorpay (IN) / Stripe (rest) |
| `catalog.ts` | — | not scheduled in v1 |

Provider failure surfaces as `502 provider_error` — it must never crash the page.
