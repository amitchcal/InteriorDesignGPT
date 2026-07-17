import { z } from "zod";

import { tiers } from "./market";

/**
 * BOQ engine output (Task 8), matching docs/prompts/boq-engine.md.
 *
 * Money is integer minor units throughout (non-negotiable #5). `z.number().int()`
 * is doing real work here: it's the line where a float from the model is
 * rejected rather than rounded into a client's quote.
 */

export const boqItemSchema = z.object({
  room: z.string().min(1),
  item_code: z.string().nullish(),
  spec: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().min(1),
  rate_minor: z.number().int("must be integer minor units").nonnegative(),
  amount_minor: z.number().int("must be integer minor units").nonnegative(),
  tier: z.enum(tiers),
});

export const valueEngineeringSchema = z.object({
  label: z.string().min(1),
  /** A saving: negative integer minor units. */
  delta_minor: z.number().int("must be integer minor units"),
  note: z.string(),
});

/** What the engine returns. Its money fields are compared, then recomputed. */
export const boqEngineOutputSchema = z.object({
  items: z.array(boqItemSchema).min(1),
  subtotal_minor: z.number().int(),
  tax_minor: z.number().int(),
  total_minor: z.number().int(),
  currency: z.string().min(1),
  budget_total_minor: z.number().int().nullish(),
  budget_delta_minor: z.number().int(),
  value_engineering: z.array(valueEngineeringSchema),
  assumptions: z.array(z.string()),
});

export type BoqEngineOutput = z.infer<typeof boqEngineOutputSchema>;
export type BoqItem = z.infer<typeof boqItemSchema>;
export type ValueEngineeringOption = z.infer<typeof valueEngineeringSchema>;

/** The persisted, arithmetic-authoritative summary. */
export type BoqSummary = {
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  currency: string;
  budget_delta_minor: number | null;
  value_engineering: ValueEngineeringOption[];
};
