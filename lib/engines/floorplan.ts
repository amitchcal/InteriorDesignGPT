import type Anthropic from "@anthropic-ai/sdk";

import { EngineError, MODELS, getClient, parseEngineJson } from "./client";
import { loadPrompt } from "./prompt";
import { parseResultSchema, type ParseResult } from "@/types/floorplan";

/**
 * Floor-plan vision parse (Task 5).
 *
 * Best-effort by design: it pre-fills a form the user then corrects, and never
 * blocks progress. Every failure path here is recoverable by the caller falling
 * back to manual entry (E1-5).
 */

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const PDF_TYPE = "application/pdf";

export const ACCEPTED_PLAN_TYPES = [...IMAGE_TYPES, PDF_TYPE];

/** 32MB is the API's request ceiling; stay under it with room for the prompt. */
export const MAX_PLAN_BYTES = 28 * 1024 * 1024;

export function isAcceptedPlanType(mime: string): boolean {
  return (ACCEPTED_PLAN_TYPES as readonly string[]).includes(mime);
}

/**
 * PDFs and images take different content blocks — a PDF sent as an `image`
 * block is rejected by the API.
 */
function planBlock(
  base64: string,
  mediaType: string,
): Anthropic.ContentBlockParam {
  if (mediaType === PDF_TYPE) {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    };
  }

  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType as (typeof IMAGE_TYPES)[number],
      data: base64,
    },
  };
}

export async function parseFloorPlan({
  base64,
  mediaType,
}: {
  base64: string;
  mediaType: string;
}): Promise<ParseResult> {
  if (!isAcceptedPlanType(mediaType)) {
    throw new EngineError(`Unsupported plan type: ${mediaType}`);
  }

  const systemPrompt = await loadPrompt("floorplan-parse");

  let message: Anthropic.Message;
  try {
    message = await getClient().messages.create({
      model: MODELS.reasoning,
      max_tokens: 4096,
      // The prompt is stable across every parse — cache it (docs/infra.md).
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          // Document/image first, then the instruction — the documented order.
          content: [
            planBlock(base64, mediaType),
            { type: "text", text: "Extract the room schedule from this floor plan." },
          ],
        },
      ],
    });
  } catch (error) {
    // Network failure, auth failure, rate limit, provider outage. The route maps
    // this to 502 and the UI falls back to manual entry.
    throw new EngineError(
      error instanceof Error ? error.message : "Vision parse failed.",
      error,
    );
  }

  if (message.stop_reason === "refusal") {
    throw new EngineError("The model declined to read this file.");
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (!text.trim()) {
    throw new EngineError("Vision parse returned no content.");
  }

  // Throws EngineOutputError if it isn't the agreed schema — never persisted
  // unvalidated (CLAUDE.md).
  return parseEngineJson(text, parseResultSchema);
}
