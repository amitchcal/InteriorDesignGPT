import { describe, expect, it } from "vitest";

import { costBoq } from "@/lib/boq/cost";
import type { BoqEngineOutput } from "@/types/boq";
import type { RateRow } from "@/types/market";

/**
 * The revenue wedge. Task 8 found the model gets every total wrong, so the
 * arithmetic is recomputed in code — these tests are the guard on that code.
 */

const rates: RateRow[] = [
  { item_code: "FLR-ENG-LUX", item_label: "Engineered wood", category: "Flooring", unit: "sqft", rate_minor: 42000, tier: "luxury", region: "metro", notes: null },
  { item_code: "KIT-MOD-PRM", item_label: "Modular kitchen", category: "Kitchen", unit: "sqft", rate_minor: 230000, tier: "premium", region: "metro", notes: null },
];

function output(overrides: Partial<BoqEngineOutput> = {}): BoqEngineOutput {
  return {
    items: [
      { room: "Living", item_code: "FLR-ENG-LUX", spec: "wood floor", qty: 234, unit: "sqft", rate_minor: 42000, amount_minor: 9828000, tier: "luxury" },
      { room: "Kitchen", item_code: "KIT-MOD-PRM", spec: "kitchen", qty: 42, unit: "sqft", rate_minor: 230000, amount_minor: 9660000, tier: "premium" },
    ],
    subtotal_minor: 19488000,
    tax_minor: 3507840,
    total_minor: 22995840,
    currency: "INR",
    budget_delta_minor: 0,
    value_engineering: [],
    assumptions: [],
    ...overrides,
  };
}

describe("costBoq", () => {
  it("reconciles: subtotal = sum(amounts), tax = round(subtotal*rate), total = subtotal+tax", () => {
    const c = costBoq({ output: output(), rates, taxRate: 0.18, budgetTotalMinor: null });
    const sumAmounts = c.items.reduce((s, i) => s + i.amount_minor, 0);
    expect(c.subtotal_minor).toBe(sumAmounts);
    expect(c.tax_minor).toBe(Math.round(c.subtotal_minor * 0.18));
    expect(c.total_minor).toBe(c.subtotal_minor + c.tax_minor);
  });

  it("recomputes each line as round(qty * rate) — never trusts the model amount", () => {
    // Model claims a wrong amount for the Living line; cost must override it.
    const bad = output();
    bad.items[0].amount_minor = 111; // nonsense
    const c = costBoq({ output: bad, rates, taxRate: 0.18, budgetTotalMinor: null });
    expect(c.items[0].amount_minor).toBe(Math.round(234 * 42000));
  });

  it("takes the rate from the library, not the model, and records the correction", () => {
    const tampered = output();
    tampered.items[0].rate_minor = 1; // model tries a bogus rate
    const c = costBoq({ output: tampered, rates, taxRate: 0.18, budgetTotalMinor: null });
    expect(c.items[0].rate_minor).toBe(42000); // library wins
    expect(c.rate_corrections).toEqual([{ item_code: "FLR-ENG-LUX", model: 1, library: 42000 }]);
  });

  it("flags an item_code that isn't in the market's library", () => {
    const o = output();
    o.items[0].item_code = "NOT-A-CODE";
    const c = costBoq({ output: o, rates, taxRate: 0.18, budgetTotalMinor: null });
    expect(c.unknown_item_codes).toContain("NOT-A-CODE");
  });

  it("detects when the model's own totals disagree with the computed ones", () => {
    const wrong = output({ subtotal_minor: 1, total_minor: 2, budget_delta_minor: 3 });
    const c = costBoq({ output: wrong, rates, taxRate: 0.18, budgetTotalMinor: 100 });
    const fields = c.arithmetic_drift.map((d) => d.field);
    expect(fields).toContain("subtotal_minor");
    expect(fields).toContain("total_minor");
  });

  it("computes budget_delta as total - budget (negative = under)", () => {
    const c = costBoq({ output: output(), rates, taxRate: 0.18, budgetTotalMinor: 25000000 });
    expect(c.budget_delta_minor).toBe(c.total_minor - 25000000);
    expect(c.budget_delta_minor).toBeLessThan(0); // under budget
  });

  it("null budget yields null delta", () => {
    const c = costBoq({ output: output(), rates, taxRate: 0.18, budgetTotalMinor: null });
    expect(c.budget_delta_minor).toBeNull();
  });

  it("keeps all money as integers", () => {
    const c = costBoq({ output: output(), rates, taxRate: 0.18, budgetTotalMinor: 25000000 });
    for (const i of c.items) {
      expect(Number.isInteger(i.rate_minor)).toBe(true);
      expect(Number.isInteger(i.amount_minor)).toBe(true);
    }
    expect(Number.isInteger(c.subtotal_minor)).toBe(true);
    expect(Number.isInteger(c.tax_minor)).toBe(true);
    expect(Number.isInteger(c.total_minor)).toBe(true);
  });

  it("US-style zero tax: total equals subtotal", () => {
    const c = costBoq({ output: output(), rates, taxRate: 0, budgetTotalMinor: null });
    expect(c.tax_minor).toBe(0);
    expect(c.total_minor).toBe(c.subtotal_minor);
  });
});
