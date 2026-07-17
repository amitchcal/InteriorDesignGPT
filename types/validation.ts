import { z } from "zod";

/**
 * Validation gate output (Task 6), shaped by the prompt in
 * docs/prompts/dna-and-validation.md and api-contracts.md.
 */
export const validationResultSchema = z.object({
  ok: z.boolean(),
  /** Mandatory fields absent, e.g. "budget_total", "rooms[2].ceiling_ht". */
  missing: z.array(z.string()),
  /** `default_on` cultural rules the user hasn't confirmed yet. */
  cultural_confirmations: z.array(z.string()),
  normalized_units: z.string().nullish(),
  style_pref_normalized: z.string().nullish(),
});

export type ValidationResult = z.infer<typeof validationResultSchema>;

/** The engine's own reply — `ok` is recomputed from the parts, so it isn't read. */
export const validationEngineOutputSchema = validationResultSchema.omit({
  ok: true,
});

export type ValidationEngineOutput = z.infer<typeof validationEngineOutputSchema>;

/** PUT /api/projects/:id/cultural — the gate's confirm step. */
export const confirmCulturalSchema = z.object({
  /** rule id -> on/off, as the user answered it. */
  rules: z.record(z.string(), z.boolean()),
});
