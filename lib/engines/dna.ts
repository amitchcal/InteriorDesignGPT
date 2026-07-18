import type Anthropic from "@anthropic-ai/sdk";

import { EngineError, MODELS, getClient, parseEngineJson } from "./client";
import { loadPrompt } from "./prompt";
import { dnaSchema, type Dna } from "@/types/dna";

/**
 * Designer-DNA Engine (Task 11) — a vision pass over a designer's past work.
 *
 * master.md is NOT prepended (see dna-engine.md): this is perception, not
 * design. The images are sent as an image block per asset; the model reads the
 * whole set together to find recurring choices.
 */

export type DnaImage = { base64: string; mediaType: string };

type ImageMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export async function runDnaEngine(images: DnaImage[]): Promise<Dna> {
  if (images.length === 0) throw new EngineError("No images to analyse.");

  const systemPrompt = await loadPrompt("dna-engine");

  const imageBlocks: Anthropic.ContentBlockParam[] = images.map((img) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: img.mediaType as ImageMedia,
      data: img.base64,
    },
  }));

  let message: Anthropic.Message;
  try {
    message = await getClient().messages.create({
      model: MODELS.reasoning,
      max_tokens: 2048,
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `These are ${images.length} images of this designer's past work. Extract their DNA.`,
            },
          ],
        },
      ],
    });
  } catch (error) {
    throw new EngineError(
      error instanceof Error ? error.message : "DNA engine failed.",
      error,
    );
  }

  if (message.stop_reason === "refusal") {
    throw new EngineError("The model declined these images.");
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (!text.trim()) throw new EngineError("DNA engine returned no content.");

  return parseEngineJson(text, dnaSchema);
}
