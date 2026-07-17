import type Anthropic from "@anthropic-ai/sdk";

import { EngineError, MODELS, getClient, parseEngineJson } from "./client";
import { loadMasterPrompt, loadPrompt } from "./prompt";
import { proposalCopySchema, type ProposalCopy } from "@/types/proposal";
import type { Concept } from "@/types/concept";
import type { MarketConfig } from "@/types/market";

/**
 * Proposal Engine (Task 9) — concept + BOQ into client-ready copy.
 *
 * Money arrives pre-formatted. The prompt says "never re-derive numbers", and
 * Task 8 measured this model getting every BOQ total wrong — so it is handed
 * strings to quote, not figures to compute.
 */

export type ProposalInput = {
  market_profile: MarketConfig;
  intake: unknown;
  concept: Concept;
  boq: {
    /** Pre-formatted, e.g. "₹17,93,471.38". */
    total: string;
    subtotal: string;
    tax: string;
    tax_name: string;
    budget_status: string | null;
    item_count: number;
    value_engineering: { label: string; saving: string; note: string }[];
  };
  designer_brand: string | null;
};

export async function runProposalEngine(
  input: ProposalInput,
): Promise<ProposalCopy> {
  const [master, proposal] = await Promise.all([
    loadMasterPrompt(),
    loadPrompt("proposal-engine"),
  ]);

  let message: Anthropic.Message;
  try {
    message = await getClient().messages.create({
      model: MODELS.reasoning,
      max_tokens: 8192,
      temperature: 0.5,
      system: [
        {
          type: "text",
          text: `${master}\n\n---\n\n${proposal}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: JSON.stringify(input) }],
    });
  } catch (error) {
    throw new EngineError(
      error instanceof Error ? error.message : "Proposal engine failed.",
      error,
    );
  }

  if (message.stop_reason === "refusal") {
    throw new EngineError("The model declined this brief.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new EngineError("The proposal exceeded the output limit.");
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (!text.trim()) throw new EngineError("Proposal engine returned no content.");

  return parseEngineJson(text, proposalCopySchema);
}
