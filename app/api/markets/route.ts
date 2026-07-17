import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import { serverError, unauthorized } from "@/lib/api/errors";
import { getMarketProfiles } from "@/lib/market";

/**
 * GET /api/markets — active markets, for driving intake UI units/currency/labels.
 *
 * Contract (docs/api-contracts.md):
 *   200 { "markets":[{ "market_code":"IN","display_name":"India","currency":{...} }] }
 *
 * The contract's `{...}` is open-ended; we return the fields intake actually
 * needs (units, tax, cultural rules, tiers) rather than the whole config, so a
 * profile gaining internal fields doesn't reshape this response.
 */
export async function GET() {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  try {
    const profiles = await getMarketProfiles();

    return NextResponse.json({
      markets: profiles.map(({ market_code, config }) => ({
        market_code,
        display_name: config.display_name,
        locale: config.locale,
        currency: config.currency,
        units: config.units,
        area_basis: config.area_basis,
        tax: config.tax,
        cultural_rules: config.cultural_rules,
        construction_modes: config.construction_modes,
        brand_tiers: config.brand_tiers,
      })),
    });
  } catch {
    return serverError();
  }
}
