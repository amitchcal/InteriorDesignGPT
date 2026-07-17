import type { SupabaseClient } from "@supabase/supabase-js";

import {
  marketConfigSchema,
  type MarketProfile,
  type RateRow,
  type Tier,
} from "@/types/market";
import { MarketConfigInvalidError, MarketNotFoundError } from "./index";

/**
 * Client-injected market loaders — no cookies, no React cache.
 *
 * `lib/market/index.ts` is request-scoped: it builds a cookie-based Supabase
 * client and memoizes with React cache(). The worker has neither a request nor
 * cookies, so it can't use those. These take the client explicitly and are
 * otherwise identical, reading the same reference tables with the same
 * validation. Routes keep using index.ts; the worker uses these.
 */

export async function loadMarketProfile(
  svc: SupabaseClient,
  code: string,
): Promise<MarketProfile> {
  const { data, error } = await svc
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
}

export async function loadRates(
  svc: SupabaseClient,
  code: string,
  options?: { tier?: Tier; region?: string },
): Promise<RateRow[]> {
  let query = svc
    .from("rate_libraries")
    .select("item_code, item_label, category, unit, rate_minor, tier, region, notes")
    .eq("market_code", code);

  if (options?.tier) query = query.eq("tier", options.tier);
  if (options?.region) query = query.eq("region", options.region);

  const { data, error } = await query.order("item_code");
  if (error) throw new Error(`Failed to load rates for '${code}': ${error.message}`);

  return (data ?? []) as RateRow[];
}
