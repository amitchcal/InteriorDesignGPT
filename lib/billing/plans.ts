/**
 * Plans and their project quotas. The quota is what create_project enforces
 * (0008/0009); checkout upgrades the subscription to one of these.
 *
 * Prices are integer minor units per market currency (non-negotiable #5), keyed
 * by currency code so a new market reuses the same plan definitions — no plan
 * code changes per market, matching the localization thesis (E6-1).
 */

export const plans = ["starter", "professional", "studio"] as const;
export type PlanId = (typeof plans)[number];

export type Plan = {
  id: PlanId;
  quota_projects: number;
  /** Price per currency code. Absent = not sold in that currency. */
  price_minor: Record<string, number>;
  /** Free plans skip checkout entirely. */
  free: boolean;
};

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    quota_projects: 10,
    price_minor: {},
    free: true,
  },
  professional: {
    id: "professional",
    quota_projects: 50,
    // ₹2,400/mo · $29/mo
    price_minor: { INR: 240000, USD: 2900 },
    free: false,
  },
  studio: {
    id: "studio",
    quota_projects: 200,
    // ₹9,600/mo · $99/mo
    price_minor: { INR: 960000, USD: 9900 },
    free: false,
  },
};

export function getPlan(id: string): Plan | null {
  return (PLANS as Record<string, Plan>)[id] ?? null;
}
