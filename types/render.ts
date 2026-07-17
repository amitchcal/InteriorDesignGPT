import { z } from "zod";

import { renderBriefSchema } from "./concept";

/** render_jobs.status in 0001. */
export const renderStatuses = ["queued", "running", "done", "failed"] as const;
export type RenderStatus = (typeof renderStatuses)[number];

/** POST /api/projects/:id/render body (api-contracts.md). */
export const renderRequestSchema = z.object({
  room: z.string().min(1, "required"),
  /** Omit to use the room's brief from the latest concept. */
  brief: renderBriefSchema.nullish(),
});

/** What a RenderProvider hands back. Vendor-agnostic. */
export type RenderDispatch = {
  /** The vendor's id for this job — opaque to everything above the provider. */
  external_id: string;
  status: RenderStatus;
};

export type RenderPoll = {
  status: RenderStatus;
  /** Present when status is 'done'. */
  image_url?: string;
  error?: string;
};
