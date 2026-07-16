# /lib/market

The moat factory. Every geographic assumption — currency, units, tax, standards,
cultural rules (vastu/feng-shui/none), brand tiers — is read from
`market_profiles` here. No country logic is hardcoded in engines
(CLAUDE.md non-negotiable #1).

Adding a market = a `market_profiles` row + a `rate_libraries` seed. Never an
engine code change (E6-1).

Built in Task 3:

- `getMarketProfile(code)` → the market's config
- `getRates(code, { tier?, region? })` → rate-library rows
- backs `GET /api/markets`

Money is integer minor units end to end; format at the edge from
`market_profile.currency` (non-negotiable #5).
