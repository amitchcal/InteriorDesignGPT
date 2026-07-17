import { z } from "zod";

/**
 * The shape of `market_profiles.config`.
 *
 * This is the contract behind CLAUDE.md non-negotiable #1: engines read every
 * geographic assumption from here, so a malformed profile must fail loudly at
 * the boundary rather than surface as a wrong currency on a client proposal.
 *
 * Adding a market means adding a row that satisfies this schema — never an
 * engine code change (E6-1).
 */

export const currencySchema = z.object({
  code: z.string().length(3), // ISO 4217
  symbol: z.string().min(1),
  /** Grouping pattern, e.g. "##,##,###" (lakh) vs "#,###.##". */
  format: z.string().min(1),
});

export const taxSchema = z.object({
  name: z.string().min(1), // "GST", "Sales Tax"
  /** Fraction, not percent: 0.18 = 18%. */
  default_rate: z.number().min(0).max(1),
  applies_to: z.string().min(1),
});

export const culturalRuleSchema = z.object({
  id: z.string().min(1), // "vastu", "feng_shui"
  label: z.string().min(1),
  /** Whether the rule starts on. The Task 6 gate makes the user confirm it. */
  default_on: z.boolean(),
  constraints: z.array(z.string()),
});

export const standardsSchema = z.object({
  ergonomics: z.string().nullable(),
  kitchen: z.string().nullable(),
  accessibility: z.string().nullable(),
});

export const brandTiersSchema = z.object({
  economy: z.array(z.string()),
  premium: z.array(z.string()),
  luxury: z.array(z.string()),
});

export const marketConfigSchema = z.object({
  display_name: z.string().min(1),
  locale: z.string().min(2), // "en-IN"
  currency: currencySchema,
  units: z.enum(["metric", "imperial"]),
  area_basis: z.string().min(1), // "carpet_area" | "square_footage"
  tax: taxSchema,
  rate_library_ref: z.string().min(1),
  standards: standardsSchema,
  cultural_rules: z.array(culturalRuleSchema),
  construction_modes: z.array(z.string()),
  brand_tiers: brandTiersSchema,
});

export type MarketConfig = z.infer<typeof marketConfigSchema>;
export type Currency = z.infer<typeof currencySchema>;
export type CulturalRule = z.infer<typeof culturalRuleSchema>;

export type MarketProfile = {
  market_code: string;
  config: MarketConfig;
  version: number;
  active: boolean;
};

/** Tiers, mirroring the `tier` enum in 0001. */
export const tiers = ["economy", "premium", "luxury"] as const;
export type Tier = (typeof tiers)[number];

export type RateRow = {
  item_code: string;
  item_label: string;
  category: string;
  unit: string;
  /** Ex-tax, integer minor units (paise/cents). Never a float. */
  rate_minor: number;
  tier: Tier;
  region: string;
  notes: string | null;
};
