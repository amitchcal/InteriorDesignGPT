import { z } from "zod";

import type { RenderBrief } from "@/types/concept";
import type { RenderDispatch, RenderPoll } from "@/types/render";

/**
 * Rented muscle, behind a swappable interface (CLAUDE.md "own the brain, rent
 * the muscle"). No vendor name appears above this file; the route talks to
 * `RenderProvider`, and the concrete one is chosen by env. Swapping vendors is
 * an env change plus one adapter here — Task 10's acceptance criterion.
 */

export type RenderBriefInput = {
  room: string;
  brief: RenderBrief;
  /** Style/market context the concept carries; folded into the prompt. */
  styleDirection?: string;
};

export interface RenderProvider {
  dispatch(input: RenderBriefInput): Promise<RenderDispatch>;
  poll(externalId: string): Promise<RenderPoll>;
}

export class RenderProviderError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RenderProviderError";
  }
}

/**
 * Turns a concept render_brief into a single diffusion prompt.
 *
 * This is the app's own prompt engineering — the exact thing an interior-
 * specific render vendor would charge a premium to do, built from richer
 * context (the room, the market's materials, the palette) than any vendor has.
 * Kept out of the concrete provider so every vendor gets the same prompt.
 */
export function briefToPrompt(input: RenderBriefInput): string {
  const { room, brief, styleDirection } = input;
  const parts = [
    `Photorealistic interior render of a ${room.toLowerCase()}.`,
    styleDirection,
    brief.key_materials.length && `Materials: ${brief.key_materials.join(", ")}.`,
    brief.palette.length && `Palette: ${brief.palette.join(", ")}.`,
    brief.lighting && `Lighting: ${brief.lighting}.`,
    brief.camera_angles.length && `Camera: ${brief.camera_angles[0]}.`,
    "Architectural photography, natural materials, no people, no text.",
  ].filter(Boolean);
  return parts.join(" ");
}

/**
 * Generic sketch/photo-to-render HTTP adapter, configured entirely by env
 * (CLAUDE.md: "no vendor name is hardcoded in business logic"). The env happens
 * to point at fal's queue API, but this code only knows "a queue endpoint that
 * takes a prompt and returns a request id, and a status/result URL under it".
 *
 * Contract it assumes (all vendor-agnostic, all env-driven):
 *   POST  {RENDER_API_URL}                         -> { request_id, status }
 *   GET   {RENDER_API_URL}/requests/{id}/status    -> { status }
 *   GET   {RENDER_API_URL}/requests/{id}           -> { images:[{ url }] }
 *   Authorization: {RENDER_API_AUTH_SCHEME} {key}
 */
const submitResponseSchema = z.object({
  request_id: z.string(),
  status: z.string().optional(),
});

const statusResponseSchema = z.object({
  status: z.string(),
});

const resultResponseSchema = z.object({
  images: z.array(z.object({ url: z.string().url() })).optional(),
  image: z.object({ url: z.string().url() }).optional(),
});

/** Map a vendor status string to our enum. Unknown -> running (keep polling). */
function normalizeStatus(raw: string): RenderPoll["status"] {
  const s = raw.toUpperCase();
  if (s === "COMPLETED" || s === "DONE" || s === "OK") return "done";
  if (s === "FAILED" || s === "ERROR" || s === "CANCELLED") return "failed";
  if (s === "IN_QUEUE" || s === "QUEUED") return "queued";
  return "running"; // IN_PROGRESS, RUNNING, anything unrecognized
}

export class GenerativeRenderProvider implements RenderProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    /** fal uses "Key"; a different vendor might use "Bearer". Env-driven. */
    private readonly authScheme: string = "Key",
  ) {}

  private headers() {
    return {
      Authorization: `${this.authScheme} ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async dispatch(input: RenderBriefInput): Promise<RenderDispatch> {
    let res: Response;
    try {
      res = await fetch(this.apiUrl, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          prompt: briefToPrompt(input),
          image_size: "landscape_4_3",
          num_images: 1,
        }),
      });
    } catch (error) {
      throw new RenderProviderError("Render provider unreachable.", error);
    }

    if (!res.ok) {
      throw new RenderProviderError(
        `Render provider rejected the request (${res.status}).`,
        await res.text().catch(() => undefined),
      );
    }

    const parsed = submitResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) {
      throw new RenderProviderError("Render provider returned an unexpected shape.");
    }

    return {
      external_id: parsed.data.request_id,
      status: parsed.data.status ? normalizeStatus(parsed.data.status) : "queued",
    };
  }

  async poll(externalId: string): Promise<RenderPoll> {
    const base = `${this.apiUrl}/requests/${encodeURIComponent(externalId)}`;

    let statusRes: Response;
    try {
      statusRes = await fetch(`${base}/status`, { headers: this.headers() });
    } catch (error) {
      throw new RenderProviderError("Render provider unreachable.", error);
    }
    if (!statusRes.ok) {
      throw new RenderProviderError(`Render status check failed (${statusRes.status}).`);
    }

    const status = statusResponseSchema.safeParse(await statusRes.json().catch(() => null));
    if (!status.success) {
      throw new RenderProviderError("Render status came back in an unexpected shape.");
    }

    const normalized = normalizeStatus(status.data.status);
    if (normalized !== "done") return { status: normalized };

    // Done — fetch the actual image URL from the result endpoint.
    let resultRes: Response;
    try {
      resultRes = await fetch(base, { headers: this.headers() });
    } catch (error) {
      throw new RenderProviderError("Render provider unreachable.", error);
    }
    if (!resultRes.ok) {
      throw new RenderProviderError(`Render result fetch failed (${resultRes.status}).`);
    }

    const result = resultResponseSchema.safeParse(await resultRes.json().catch(() => null));
    const url = result.success
      ? (result.data.images?.[0]?.url ?? result.data.image?.url)
      : undefined;

    if (!url) {
      return { status: "failed", error: "Render finished but returned no image." };
    }
    return { status: "done", image_url: url };
  }
}

/**
 * Selects the provider by env (RENDER_PROVIDER), per CLAUDE.md. Adding a vendor
 * is a new case here plus its env — no route changes.
 */
export function getRenderProvider(): RenderProvider {
  const provider = process.env.RENDER_PROVIDER ?? "generative";

  switch (provider) {
    case "generative": {
      const apiUrl = process.env.RENDER_API_URL;
      const apiKey = process.env.RENDER_API_KEY;
      if (!apiUrl || !apiKey) {
        throw new RenderProviderError(
          "RENDER_API_URL and RENDER_API_KEY must be set for the generative provider.",
        );
      }
      return new GenerativeRenderProvider(
        apiUrl,
        apiKey,
        process.env.RENDER_API_AUTH_SCHEME ?? "Key",
      );
    }
    default:
      throw new RenderProviderError(`Unknown RENDER_PROVIDER: ${provider}`);
  }
}
