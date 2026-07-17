import type Anthropic from "@anthropic-ai/sdk";

import { EngineError, MODELS, getClient, parseEngineJson } from "./client";
import { loadMasterPrompt, loadPrompt } from "./prompt";
import { conceptSchema, type Concept } from "@/types/concept";
import type { MarketConfig } from "@/types/market";

/**
 * Concept Engine (Task 7) — the creative pass: zoning, style, render briefs.
 *
 * master.md + concept-engine.md, per CLAUDE.md non-negotiable #4 (engines are
 * separate, single-purpose calls).
 */

export type ConceptInput = {
  market_profile: MarketConfig;
  intake: {
    floor_plan: {
      name: string;
      length: number | null;
      width: number | null;
      ceiling_ht: number | null;
      unit: string;
      meta: unknown;
    }[];
    client_brief: unknown;
    preferences: unknown;
    cultural_overrides: Record<string, boolean>;
  };
  designer_dna?: unknown;
  /** Regenerate one room only (E2-4). */
  only_room?: string | null;
};

export async function runConceptEngine(input: ConceptInput): Promise<Concept> {
  const [master, concept] = await Promise.all([
    loadMasterPrompt(),
    loadPrompt("concept-engine"),
  ]);

  // Scope goes in the user turn, not the system block: the system block is the
  // cached prefix and must stay byte-identical across every call, or a
  // single-room run and a full run write two separate cache entries.
  const scope = input.only_room
    ? `\n\nSCOPE: Return a concept for the room named "${input.only_room}" ONLY. ` +
      `Put exactly one entry in \`rooms\`. The other rooms are unchanged and are ` +
      `given for context — do not return them.`
    : "";

  let message: Anthropic.Message;
  try {
    message = await getClient().messages.create({
      model: MODELS.reasoning,
      max_tokens: 8192,
      // Creative pass — the prompt specifies 0.7. Sampling params are still
      // accepted on sonnet-4-6 (they are rejected on Opus 4.7+/Sonnet 5, which
      // is worth knowing if this model is ever bumped).
      temperature: 0.7,
      // master + engine prompt are large and identical on every call: exactly
      // what prompt caching is for (docs/infra.md's biggest cost lever).
      system: [
        {
          type: "text",
          text: `${master}\n\n---\n\n${concept}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content:
            JSON.stringify({
              market_profile: input.market_profile,
              intake: input.intake,
              ...(input.designer_dna ? { designer_dna: input.designer_dna } : {}),
            }) + scope,
        },
      ],
    });
  } catch (error) {
    throw new EngineError(
      error instanceof Error ? error.message : "Concept engine failed.",
      error,
    );
  }

  if (message.stop_reason === "refusal") {
    throw new EngineError("The model declined this brief.");
  }
  if (message.stop_reason === "max_tokens") {
    // Truncated JSON would fail the schema with a confusing parse error.
    throw new EngineError(
      "The concept was longer than the output limit. Try fewer rooms per run.",
    );
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (!text.trim()) throw new EngineError("Concept engine returned no content.");

  return parseEngineJson(text, conceptSchema);
}
