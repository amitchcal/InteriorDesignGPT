import { defineRouting } from "next-intl/routing";

/**
 * Locales are named per market so UI copy can diverge with the
 * `market_profile` it accompanies (currency, units, spelling).
 * Adding a market = add a locale file + a `market_profiles` row.
 */
export const locales = ["en-IN", "en-US"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en-IN";

/** Maps a locale to the market it renders for. */
export const localeMarket: Record<Locale, string> = {
  "en-IN": "IN",
  "en-US": "US",
};

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
});
