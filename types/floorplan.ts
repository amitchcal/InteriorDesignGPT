import { z } from "zod";

/**
 * Floor-plan vision parse output (Task 5).
 *
 * Every dimension is nullable: the prompt instructs the model to admit a gap
 * rather than invent a number, and the schema has to allow that or the engine
 * fails exactly when the plan is messy — which is the case the fallback exists
 * for (E1-5).
 */
export const parsedRoomSchema = z.object({
  name: z.string().min(1),
  length: z.number().positive().nullable(),
  width: z.number().positive().nullable(),
  ceiling_ht: z.number().positive().nullable(),
  unit: z.enum(["ft", "m"]),
  doors: z.number().int().min(0).nullable(),
  windows: z.number().int().min(0).nullable(),
  confidence: z.number().min(0).max(1),
});

export const parseResultSchema = z.object({
  rooms: z.array(parsedRoomSchema),
  notes: z.string().nullish(),
});

export type ParsedRoom = z.infer<typeof parsedRoomSchema>;
export type ParseResult = z.infer<typeof parseResultSchema>;

/** Below this, the UI flags the room for correction (api-contracts.md). */
export const LOW_CONFIDENCE = 0.7;

/** A room as confirmed by the user — dimensions are now required. */
export const confirmedRoomSchema = z.object({
  name: z.string({ error: "required" }).trim().min(1, "required"),
  // `error` covers the missing/wrong-type case too — the default zod text
  // ("expected number, received undefined") is not the interface's voice, and
  // api-contracts shows these fields reading "required".
  length: z.number({ error: "required" }).positive("required"),
  width: z.number({ error: "required" }).positive("required"),
  ceiling_ht: z.number().positive().nullish(),
  unit: z.enum(["ft", "m"], { error: "required" }),
  meta: z
    .object({
      doors: z.number().int().min(0).nullish(),
      windows: z.number().int().min(0).nullish(),
    })
    .default({}),
});

export const confirmSchema = z.object({
  /** Null for the manual-entry path, which has no parsed plan behind it (E1-5). */
  floor_plan_id: z.string().uuid().nullish(),
  rooms: z.array(confirmedRoomSchema).min(1, "at least one room"),
});

export type ConfirmedRoom = z.infer<typeof confirmedRoomSchema>;
