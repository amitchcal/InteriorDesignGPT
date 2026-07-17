import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import {
  marketConfigSchema,
  type MarketProfile,
  type RateRow,
  type Tier,
} from "@/types/market";

/**
 * The moat factory. Every geographic assumption is read from here — no country
 * logic is hardcoded in engines (CLAUDE.md non-negotiable #1).
 *
 * Reads go through the request-scoped Supabase client, so RLS applies: these
 * are readable by any authenticated user and writable only by the service role.
 *
 * `cache()` dedupes within a single request — an engine call that needs the
 * profile and the rates shouldn't fetch the profile twice. It is not a
 * cross-request cache: rate edits (Task 8) must be visible immediately.
 */

export class MarketNotFoundError extends Error {
  constructor(code: string) {
    super(`No active market profile for '${code}'.`);
    this.name = "MarketNotFoundError";
  }
}

export class MarketConfigInvalidError extends Error {
  constructor(code: string, detail: string) {
    super(`Market profile '${code}' has an invalid config: ${detail}`);
    this.name = "MarketConfigInvalidError";
  }
}

/**
 * Fetch one active market profile, config validated.
 *
 * Throws rather than returning null on a malformed config: a bad profile means
 * every downstream number is suspect, and a silent partial is worse than a
 * failed request.
 */
export const getMarketProfile = cache(
  async (code: string): Promise<MarketProfile> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("market_profiles")
      .select("market_code, config, version, active")
      .eq("market_code", code)
      .eq("active", true)
      .maybeSingle();

    if (error) throw new Error(`Failed to load market '${code}': ${error.message}`);
    if (!data) throw new MarketNotFoundError(code);

    const parsed = marketConfigSchema.safeParse(data.config);
    if (!parsed.success) {
      throw new MarketConfigInvalidError(
        code,
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }

    return {
      market_code: data.market_code,
      config: parsed.data,
      version: data.version,
      active: data.active,
    };
  },
);

/** All active market profiles — backs GET /api/markets and the market picker. */
export const getMarketProfiles = cache(async (): Promise<MarketProfile[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("market_profiles")
    .select("market_code, config, version, active")
    .eq("active", true)
    .order("market_code");

  if (error) throw new Error(`Failed to load markets: ${error.message}`);

  return (data ?? []).map((row) => {
    const parsed = marketConfigSchema.safeParse(row.config);
    if (!parsed.success) {
      throw new MarketConfigInvalidError(
        row.market_code,
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    return {
      market_code: row.market_code,
      config: parsed.data,
      version: row.version,
      active: row.active,
    };
  });
});

/**
 * Rate library for a market, optionally narrowed.
 *
 * Rates are ex-tax integer minor units. Tax comes from the profile's
 * `tax.default_rate` and is applied by the BOQ engine (Task 8) — never baked in
 * here, so one rate row serves every tax regime.
 */
export const getRates = cache(
  async (
    code: string,
    options?: { tier?: Tier; region?: string },
  ): Promise<RateRow[]> => {
    const supabase = await createClient();

    let query = supabase
      .from("rate_libraries")
      .select("item_code, item_label, category, unit, rate_minor, tier, region, notes")
      .eq("market_code", code);

    if (options?.tier) query = query.eq("tier", options.tier);
    if (options?.region) query = query.eq("region", options.region);

    const { data, error } = await query.order("item_code");

    if (error) throw new Error(`Failed to load rates for '${code}': ${error.message}`);

    return (data ?? []) as RateRow[];
  },
);
