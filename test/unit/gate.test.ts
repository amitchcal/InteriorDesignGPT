import { describe, expect, it } from "vitest";

import { computeGateFacts } from "@/lib/validation/gate";
import type { MarketConfig } from "@/types/market";
import type { Intake } from "@/types/project";

const config: MarketConfig = {
  display_name: "India",
  locale: "en-IN",
  currency: { code: "INR", symbol: "₹", format: "##,##,###" },
  units: "imperial",
  area_basis: "carpet_area",
  tax: { name: "GST", default_rate: 0.18, applies_to: "interior_works" },
  rate_library_ref: "rates_in_v1",
  standards: { ergonomics: "NBC_IS", kitchen: "generic", accessibility: null },
  cultural_rules: [
    { id: "vastu", label: "Vastu", default_on: true, constraints: [] },
    { id: "feng_shui", label: "Feng Shui", default_on: false, constraints: [] },
  ],
  construction_modes: [],
  brand_tiers: { economy: [], premium: [], luxury: [] },
};

function intake(over: Partial<Intake> = {}): Intake {
  return {
    client_brief: { budget_total_minor: 180000000, ceiling_height: 10, ceiling_height_unit: "ft" },
    preferences: { tier: "premium" },
    cultural_overrides: { vastu: true },
    cultural_confirmed: [],
    ...over,
  };
}

describe("computeGateFacts", () => {
  it("passes a complete brief with confirmed rules", () => {
    const f = computeGateFacts({
      config,
      intake: intake({ cultural_confirmed: ["vastu"] }),
      rooms: [{ ceiling_ht: 10 }],
    });
    expect(f.missing).toEqual([]);
    expect(f.cultural_confirmations).toEqual([]);
  });

  it("flags a default_on rule that isn't confirmed yet", () => {
    const f = computeGateFacts({ config, intake: intake(), rooms: [{ ceiling_ht: 10 }] });
    expect(f.cultural_confirmations).toEqual(["vastu"]);
  });

  it("does not flag a rule that has been confirmed (even off)", () => {
    const f = computeGateFacts({
      config,
      intake: intake({ cultural_confirmed: ["vastu"] }),
      rooms: [{ ceiling_ht: 10 }],
    });
    expect(f.cultural_confirmations).toEqual([]);
  });

  it("ignores default_off rules", () => {
    // feng_shui is default_on:false — never needs confirmation.
    const f = computeGateFacts({
      config,
      intake: intake({ cultural_confirmed: ["vastu"] }),
      rooms: [{ ceiling_ht: 10 }],
    });
    expect(f.cultural_confirmations).not.toContain("feng_shui");
  });

  it("reports a missing budget", () => {
    const f = computeGateFacts({
      config,
      intake: intake({ client_brief: { budget_total_minor: 0, ceiling_height: 10, ceiling_height_unit: "ft" } }),
      rooms: [{ ceiling_ht: 10 }],
    });
    expect(f.missing).toContain("budget_total");
  });

  it("reports no rooms", () => {
    const f = computeGateFacts({ config, intake: intake(), rooms: [] });
    expect(f.missing).toContain("rooms");
  });

  it("reports a per-room missing ceiling by index", () => {
    const f = computeGateFacts({
      config,
      intake: intake(),
      rooms: [{ ceiling_ht: 10 }, { ceiling_ht: null }],
    });
    expect(f.missing).toContain("rooms[1].ceiling_ht");
  });

  it("a null intake reports everything missing", () => {
    const f = computeGateFacts({ config, intake: null, rooms: [] });
    expect(f.missing).toContain("budget_total");
    expect(f.missing).toContain("finish_tier");
    expect(f.missing).toContain("rooms");
  });
});
