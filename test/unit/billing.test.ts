import { describe, expect, it } from "vitest";

import { PLANS, getPlan } from "@/lib/billing/plans";
import { selectPaymentProvider } from "@/lib/providers/payment";

describe("plans", () => {
  it("starter is free with a 10-project quota", () => {
    expect(PLANS.starter.free).toBe(true);
    expect(PLANS.starter.quota_projects).toBe(10);
  });

  it("paid plans have larger quotas and prices in INR and USD", () => {
    expect(PLANS.professional.quota_projects).toBeGreaterThan(PLANS.starter.quota_projects);
    expect(PLANS.studio.quota_projects).toBeGreaterThan(PLANS.professional.quota_projects);
    for (const id of ["professional", "studio"] as const) {
      expect(PLANS[id].price_minor.INR).toBeGreaterThan(0);
      expect(PLANS[id].price_minor.USD).toBeGreaterThan(0);
    }
  });

  it("getPlan returns null for an unknown id", () => {
    expect(getPlan("enterprise")).toBeNull();
    expect(getPlan("professional")?.id).toBe("professional");
  });

  it("prices are integer minor units", () => {
    for (const plan of Object.values(PLANS)) {
      for (const amount of Object.values(plan.price_minor)) {
        expect(Number.isInteger(amount)).toBe(true);
      }
    }
  });
});

describe("selectPaymentProvider (E5-2)", () => {
  it("routes IN to Razorpay", () => {
    expect(selectPaymentProvider("IN").name).toBe("razorpay");
  });

  it("routes every other market to Stripe", () => {
    for (const code of ["US", "AE", "GB", "SG"]) {
      expect(selectPaymentProvider(code).name).toBe("stripe");
    }
  });
});
