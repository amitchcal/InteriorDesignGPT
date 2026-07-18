import { z } from "zod";

import { tiers } from "./market";

/**
 * `projects.intake` — the client brief.
 *
 * Three sections, matching 0001's comment on the column:
 *   client_brief        — the mandatory facts (E1-3)
 *   preferences         — tier, construction mode, style notes
 *   cultural_overrides  — which of the market's cultural rules are on
 *
 * Nothing here is market-specific: the *values* come from the selected
 * market_profile (tiers, cultural rule ids, units), never from hardcoded
 * country logic (non-negotiable #1).
 */

export const clientBriefSchema = z.object({
  /**
   * Integer minor units, per non-negotiable #5. The form converts from what the
   * designer types using the market's currency; nothing downstream divides.
   */
  budget_total_minor: z
    .number()
    .int("must be whole minor units")
    .positive("required"),
  ceiling_height: z.number().positive("required"),
  /** Derived from market_profile.units — 'm' for metric, 'ft' for imperial. */
  ceiling_height_unit: z.enum(["m", "ft"]),
  notes: z.string().max(2000).optional(),
});

export const preferencesSchema = z.object({
  tier: z.enum(tiers),
  construction_mode: z.string().optional(),
});

/**
 * Cultural rules keyed by the market's rule id ('vastu', 'feng_shui').
 * Task 6's gate makes the user confirm each `default_on` rule before the
 * Concept Engine may run, writing back here.
 */
export const culturalOverridesSchema = z.record(z.string(), z.boolean());

export const intakeSchema = z.object({
  client_brief: clientBriefSchema,
  preferences: preferencesSchema,
  cultural_overrides: culturalOverridesSchema.default({}),
  /**
   * Rule ids the user has explicitly confirmed at the Task 6 gate.
   *
   * Distinct from `cultural_overrides`, which the intake form pre-fills from
   * the market's `default_on`. A defaulted value is an assumption; this is an
   * answer. Vastu decides where a kitchen or toilet may go, so "the form
   * defaulted it on and nobody looked" is not a basis for a concept the client
   * pays for — build-tasks requires the rule be *confirmed* before Concept runs.
   */
  cultural_confirmed: z.array(z.string()).default([]),

  /**
   * A Designer-DNA profile to steer the concept toward this designer's style
   * (E2-5). Optional; the Concept Engine passes it as `designer_dna` when set.
   * Stored here rather than as a projects column to avoid a schema change — it's
   * a soft reference the concept handler resolves at run time.
   */
  dna_id: z.string().uuid().nullish(),
});

export type Intake = z.infer<typeof intakeSchema>;
export type ClientBrief = z.infer<typeof clientBriefSchema>;

/** POST /api/projects body (docs/api-contracts.md). */
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "required").max(200),
  market_code: z.string().min(2, "required"),
  intake: intakeSchema,
  org_id: z.string().uuid().nullish(),
});

export type CreateProjectBody = z.infer<typeof createProjectSchema>;

export const projectStatuses = [
  "draft",
  "validated",
  "concept",
  "boq",
  "proposal",
  "complete",
] as const;
export type ProjectStatus = (typeof projectStatuses)[number];
