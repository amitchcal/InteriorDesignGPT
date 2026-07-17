import { z } from "zod";

/**
 * Concept Engine output (Task 7), matching docs/prompts/concept-engine.md.
 *
 * CLAUDE.md: validate every engine's JSON against a schema before persisting.
 * Nothing here is market-specific — cultural rule ids and standards come from
 * the market_profile, so the same schema serves every market (E6-1).
 */

export const renderBriefSchema = z.object({
  camera_angles: z.array(z.string()),
  lighting: z.string(),
  key_materials: z.array(z.string()),
  palette: z.array(z.string()),
});

export const conceptRoomSchema = z.object({
  name: z.string().min(1),
  zoning_rationale: z.string(),
  style_direction: z.string(),
  key_features: z.array(z.string()),
  /** Trade-offs surfaced by an active cultural rule; [] if none (E2-3). */
  cultural_notes: z.array(z.string()),
  /** Ergonomic issues per the market's standards; [] if none (E2-2). */
  clearance_flags: z.array(z.string()),
  render_brief: renderBriefSchema,
});

export const conceptSchema = z.object({
  rooms: z.array(conceptRoomSchema).min(1),
  overall_direction: z.string(),
  applied_cultural_rules: z.array(z.string()),
  assumptions: z.array(z.string()),
});

export type Concept = z.infer<typeof conceptSchema>;
export type ConceptRoom = z.infer<typeof conceptRoomSchema>;
export type RenderBrief = z.infer<typeof renderBriefSchema>;

/** POST /api/projects/:id/concept body. */
export const conceptRequestSchema = z.object({
  /**
   * Regenerate just this room, carrying the rest of the latest concept forward
   * (E2-4). Omit to generate the whole project.
   */
  room: z.string().min(1).nullish(),
});
