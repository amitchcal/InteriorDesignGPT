import { z } from "zod";

/** Designer-DNA engine output (Task 11), matching docs/prompts/dna-engine.md. */
export const dnaSchema = z.object({
  preferred_materials: z.array(z.string()),
  preferred_colors: z.array(z.string()),
  preferred_layout_patterns: z.array(z.string()),
  signature_elements: z.array(z.string()),
  style_name: z.string(),
  /** Honest note on sample sufficiency; flags <20 assets (E2-5). */
  confidence_note: z.string(),
});

export type Dna = z.infer<typeof dnaSchema>;

/** asset_kind enum from 0001. */
export const assetKinds = ["image", "moodboard", "material", "render"] as const;
export type AssetKind = (typeof assetKinds)[number];

/** Upper bound on images per DNA profile — enforced in the UI and the schema. */
export const MAX_IMAGES = 40;

/** Per-image size ceiling (Claude vision base64 limit). Enforced client-side. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Media types the DNA engine (and the upload UI) accept. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

/** POST /api/dna body (api-contracts.md). */
export const createDnaSchema = z.object({
  name: z.string().trim().min(1, "required").max(120),
  /** Storage paths in the private dna-assets bucket: <uid>/... */
  asset_paths: z
    .array(z.string().min(1))
    .min(1, "at least one image")
    .max(MAX_IMAGES),
});

/** Below this the confidence note must flag a thin sample (E2-5). */
export const THIN_SAMPLE = 20;
