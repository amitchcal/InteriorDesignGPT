import type Anthropic from "@anthropic-ai/sdk";

import { EngineError, MODELS, getClient, parseEngineJson } from "./client";
import { loadPrompt } from "./prompt";
import type { MarketProfile } from "@/types/market";
import {
  validationEngineOutputSchema,
  type ValidationEngineOutput,
} from "@/types/validation";

/**
 * Validation gate (Task 6, E6-3) — the cheap gatekeeper in front of the
 * expensive engines.
 *
 * Runs on Haiku per CLAUDE.md. See `validateIntake` in the route for how the
 * engine's answer is treated: this call is the spec's, but the gate does not
 * stake the whole pipeline on it — see the comment there.
 */

export type ValidationInput = {
  market_profile: MarketProfile["config"];
  intake: unknown;
  rooms: { name: string; ceiling_ht: number | null }[];
};

export async function runValidationGate(
  input: ValidationInput,
): Promise<ValidationEngineOutput> {
  const systemPrompt = await loadPrompt("validation-gate");

  let message: Anthropic.Message;
  try {
    message = await getClient().messages.create({
      model: MODELS.gate,
      max_tokens: 1024,
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            market_profile: input.market_profile,
            intake: input.intake,
            rooms: input.rooms,
          }),
        },
      ],
    });
  } catch (error) {
    throw new EngineError(
      error instanceof Error ? error.message : "Validation gate failed.",
      error,
    );
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (!text.trim()) throw new EngineError("Validation gate returned no content.");

  return parseEngineJson(text, validationEngineOutputSchema);
}
