import type { RateRow } from "@/types/market";
import type { BoqEngineOutput, BoqItem } from "@/types/boq";

/**
 * The BOQ arithmetic, computed from the rate library.
 *
 * Why this isn't left to the model: steps 3-4 of the prompt are multiply, sum,
 * percent, subtract — over 30+ line items. That is the number a client is
 * quoted. Task 8's [M] requires that subtotal+tax=total and that
 * budget_delta_minor is *correct*, and an LLM that is 97% reliable at
 * arithmetic is 100% unfit to decide a price. The validation gate already
 * showed the same model disagreeing with a mechanical fact on 3 of 10 calls.
 *
 * The model still does the part that needs judgement — which items, what
 * quantity, from what basis. Rates come from the library by item_code, so a
 * hallucinated rate can't reach a quote either.
 */

export type CostedBoq = {
  items: BoqItem[];
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  budget_delta_minor: number | null;
  /** Line items whose rate the model got wrong; rate came from the library. */
  rate_corrections: { item_code: string; model: number; library: number }[];
  /** Item codes the model used that aren't in this market's library. */
  unknown_item_codes: string[];
  /** Where the model's own totals disagreed with the computed ones. */
  arithmetic_drift: { field: string; model: number; computed: number }[];
};

export function costBoq({
  output,
  rates,
  taxRate,
  budgetTotalMinor,
}: {
  output: BoqEngineOutput;
  rates: RateRow[];
  taxRate: number;
  budgetTotalMinor: number | null;
}): CostedBoq {
  const byCode = new Map(rates.map((r) => [r.item_code, r]));

  const rate_corrections: CostedBoq["rate_corrections"] = [];
  const unknown_item_codes: string[] = [];

  const items: BoqItem[] = output.items.map((item) => {
    // The library is authoritative for price. The model may only choose which
    // item — never what it costs.
    const known = item.item_code ? byCode.get(item.item_code) : undefined;

    if (item.item_code && !known) {
      // The prompt allows substituting the nearest item but forbids inventing a
      // code. Keep the model's rate (it was told to estimate) and surface it.
      unknown_item_codes.push(item.item_code);
    }

    const rate_minor = known ? known.rate_minor : item.rate_minor;

    if (known && known.rate_minor !== item.rate_minor) {
      rate_corrections.push({
        item_code: item.item_code!,
        model: item.rate_minor,
        library: known.rate_minor,
      });
    }

    return {
      ...item,
      rate_minor,
      // round(), not floor/ceil — the prompt's own rule, and it keeps the line
      // amounts summing to what a human recomputing them would get.
      amount_minor: Math.round(item.qty * rate_minor),
    };
  });

  const subtotal_minor = items.reduce((sum, i) => sum + i.amount_minor, 0);
  const tax_minor = Math.round(subtotal_minor * taxRate);
  const total_minor = subtotal_minor + tax_minor;
  const budget_delta_minor =
    budgetTotalMinor === null ? null : total_minor - budgetTotalMinor;

  const arithmetic_drift: CostedBoq["arithmetic_drift"] = [];
  const check = (field: string, model: number, computed: number) => {
    if (model !== computed) arithmetic_drift.push({ field, model, computed });
  };
  check("subtotal_minor", output.subtotal_minor, subtotal_minor);
  check("tax_minor", output.tax_minor, tax_minor);
  check("total_minor", output.total_minor, total_minor);
  if (budget_delta_minor !== null) {
    check("budget_delta_minor", output.budget_delta_minor, budget_delta_minor);
  }

  return {
    items,
    subtotal_minor,
    tax_minor,
    total_minor,
    budget_delta_minor,
    rate_corrections,
    unknown_item_codes,
    arithmetic_drift,
  };
}
