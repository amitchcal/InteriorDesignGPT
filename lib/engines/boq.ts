import type Anthropic from "@anthropic-ai/sdk";

import { EngineError, MODELS, getClient, parseEngineJson } from "./client";
import { loadMasterPrompt, loadPrompt } from "./prompt";
import { boqEngineOutputSchema, type BoqEngineOutput } from "@/types/boq";
import type { Concept } from "@/types/concept";
import type { MarketConfig, RateRow } from "@/types/market";

/**
 * BOQ + Cost Engine (Task 8) — the revenue wedge.
 *
 * master.md + boq-engine.md at temp 0.2, per the prompt: this is the numeric
 * pass, accuracy over flair.
 */

export type BoqInput = {
  market_profile: MarketConfig;
  intake: {
    floor_plan: unknown;
    client_brief: unknown;
    preferences: unknown;
    cultural_overrides: Record<string, boolean>;
  };
  concept: Concept;
  rate_library: RateRow[];
};

export async function runBoqEngine(input: BoqInput): Promise<BoqEngineOutput> {
  const [master, boq] = await Promise.all([
    loadMasterPrompt(),
    loadPrompt("boq-engine"),
  ]);

  let message: Anthropic.Message;
  try {
    message = await getClient().messages.create({
      model: MODELS.reasoning,
      // A 5-room BOQ runs 30-40 line items; leave room so the JSON isn't cut
      // off mid-array, which would surface as a confusing parse error.
      max_tokens: 16000,
      temperature: 0.2,
      system: [
        {
          type: "text",
          text: `${master}\n\n---\n\n${boq}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            market_profile: input.market_profile,
            intake: input.intake,
            concept: input.concept,
            rate_library: input.rate_library,
          }),
        },
      ],
    });
  } catch (error) {
    throw new EngineError(
      error instanceof Error ? error.message : "BOQ engine failed.",
      error,
    );
  }

  if (message.stop_reason === "refusal") {
    throw new EngineError("The model declined this brief.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new EngineError(
      "The BOQ was longer than the output limit. Try fewer rooms per run.",
    );
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (!text.trim()) throw new EngineError("BOQ engine returned no content.");

  return parseEngineJson(text, boqEngineOutputSchema);
}
