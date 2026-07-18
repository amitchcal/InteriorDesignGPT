import { describe, expect, it } from "vitest";

import { boqEngineOutputSchema } from "@/types/boq";
import { dnaSchema } from "@/types/dna";
import { confirmedRoomSchema, parseResultSchema } from "@/types/floorplan";
import { marketConfigSchema } from "@/types/market";
import { intakeSchema } from "@/types/project";

describe("marketConfigSchema", () => {
  const good = {
    display_name: "India",
    locale: "en-IN",
    currency: { code: "INR", symbol: "₹", format: "##,##,###" },
    units: "imperial",
    area_basis: "carpet_area",
    tax: { name: "GST", default_rate: 0.18, applies_to: "interior_works" },
    rate_library_ref: "rates_in_v1",
    standards: { ergonomics: "NBC_IS", kitchen: "generic", accessibility: null },
    cultural_rules: [{ id: "vastu", label: "Vastu", default_on: true, constraints: [] }],
    construction_modes: ["modular"],
    brand_tiers: { economy: [], premium: [], luxury: [] },
  };

  it("accepts a valid config", () => {
    expect(marketConfigSchema.safeParse(good).success).toBe(true);
  });

  it("rejects an out-of-range tax rate", () => {
    expect(marketConfigSchema.safeParse({ ...good, tax: { ...good.tax, default_rate: 1.8 } }).success).toBe(false);
  });

  it("rejects an unknown units value", () => {
    expect(marketConfigSchema.safeParse({ ...good, units: "furlongs" }).success).toBe(false);
  });
});

describe("boqEngineOutputSchema — money must be integer minor units", () => {
  const base = {
    items: [{ room: "L", item_code: "X", spec: "s", qty: 1, unit: "sqft", rate_minor: 100, amount_minor: 100, tier: "premium" }],
    subtotal_minor: 100,
    tax_minor: 18,
    total_minor: 118,
    currency: "INR",
    budget_delta_minor: 0,
    value_engineering: [],
    assumptions: [],
  };

  it("accepts integer money", () => {
    expect(boqEngineOutputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a float rate — the line where a float from the model is stopped", () => {
    const bad = structuredClone(base);
    bad.items[0].rate_minor = 100.5;
    expect(boqEngineOutputSchema.safeParse(bad).success).toBe(false);
  });
});

describe("intakeSchema", () => {
  const good = {
    client_brief: { budget_total_minor: 180000000, ceiling_height: 10, ceiling_height_unit: "ft" },
    preferences: { tier: "premium" },
    cultural_overrides: { vastu: true },
  };

  it("accepts a valid intake and defaults the arrays", () => {
    const r = intakeSchema.safeParse(good);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cultural_confirmed).toEqual([]);
    }
  });

  it("rejects a fractional budget (must be whole minor units)", () => {
    expect(
      intakeSchema.safeParse({ ...good, client_brief: { ...good.client_brief, budget_total_minor: 1.5 } }).success,
    ).toBe(false);
  });

  it("accepts an optional dna_id", () => {
    const r = intakeSchema.safeParse({ ...good, dna_id: "11111111-1111-4111-8111-111111111111" });
    expect(r.success).toBe(true);
  });
});

describe("floorplan schemas", () => {
  it("parse result allows null dimensions (the model must admit gaps)", () => {
    const r = parseResultSchema.safeParse({
      rooms: [{ name: "L", length: null, width: null, ceiling_ht: null, unit: "ft", doors: null, windows: null, confidence: 0.3 }],
    });
    expect(r.success).toBe(true);
  });

  it("confirmed room requires real dimensions with the interface's 'required' message", () => {
    const r = confirmedRoomSchema.safeParse({ name: "L", unit: "ft", meta: {} });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msgs = r.error.issues.map((i) => i.message);
      expect(msgs).toContain("required");
    }
  });
});

describe("dnaSchema", () => {
  it("accepts a full DNA and rejects a missing confidence_note", () => {
    const dna = {
      preferred_materials: ["walnut"],
      preferred_colors: ["green"],
      preferred_layout_patterns: [],
      signature_elements: [],
      style_name: "warm",
      confidence_note: "thin sample",
    };
    expect(dnaSchema.safeParse(dna).success).toBe(true);
    const { confidence_note: _omit, ...missing } = dna;
    void _omit;
    expect(dnaSchema.safeParse(missing).success).toBe(false);
  });
});
