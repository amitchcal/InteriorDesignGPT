import { describe, expect, it } from "vitest";

import { formatMoney, toMinor } from "@/lib/market/money";
import type { Currency } from "@/types/market";

const INR: Currency = { code: "INR", symbol: "₹", format: "##,##,###" };
const USD: Currency = { code: "USD", symbol: "$", format: "#,###.##" };

describe("formatMoney", () => {
  it("groups IN amounts in lakhs (the point of non-negotiable #1)", () => {
    // 18,00,000.00 rupees = 180000000 paise
    const s = formatMoney(180000000, INR, "en-IN");
    expect(s).toContain("₹");
    expect(s).toContain("18,00,000");
  });

  it("groups the same integer in thousands for US", () => {
    const s = formatMoney(180000000, USD, "en-US");
    expect(s).toContain("$");
    expect(s).toContain("1,800,000");
  });

  it("throws on a non-integer — a float must never reach a quote", () => {
    expect(() => formatMoney(1234.5, INR, "en-IN")).toThrow();
  });

  it("round-trips through toMinor", () => {
    expect(toMinor(1800000, INR, "en-IN")).toBe(180000000);
    expect(toMinor(18000, USD, "en-US")).toBe(1800000);
  });

  it("rounds fractional major units rather than persisting a fractional paisa", () => {
    expect(toMinor(1234.567, INR, "en-IN")).toBe(123457);
  });

  // Probe: the function claims to derive minor-units from the currency (not a
  // hardcoded /100). A 0-decimal currency (JPY) must NOT be divided by 100.
  it("handles a 0-decimal currency without dividing by 100", () => {
    const JPY: Currency = { code: "JPY", symbol: "¥", format: "#,###" };
    const s = formatMoney(1000, JPY, "ja-JP"); // 1000 yen, not 10
    expect(s).toContain("1,000");
    expect(toMinor(1000, JPY, "ja-JP")).toBe(1000);
  });

  it("formats a large budget without losing digits", () => {
    // ₹9,60,00,000.00 (studio-scale) = 9_600_000_000 paise
    expect(formatMoney(96000000000, INR, "en-IN")).toContain("96,00,00,000");
  });
});
