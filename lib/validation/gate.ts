import type { MarketConfig } from "@/types/market";
import type { Intake } from "@/types/project";

/**
 * The mandatory-field and cultural-confirmation rules, computed in code.
 *
 * The same rules the Haiku prompt states. They're mechanical — "is budget_total
 * present", "does every room have a ceiling height" — so they're computed here
 * rather than inferred, and the engine's answer is compared against this.
 *
 * See the route for why both exist.
 */

export type GateFacts = {
  missing: string[];
  cultural_confirmations: string[];
};

export function computeGateFacts({
  config,
  intake,
  rooms,
}: {
  config: MarketConfig;
  intake: Intake | null;
  rooms: { ceiling_ht: number | null }[];
}): GateFacts {
  const missing: string[] = [];

  // A field is missing if absent, null, or zero (prompt's own rule).
  if (!intake?.client_brief?.budget_total_minor) missing.push("budget_total");
  if (!intake?.preferences?.tier) missing.push("finish_tier");

  if (rooms.length === 0) {
    missing.push("rooms");
  } else {
    rooms.forEach((room, i) => {
      if (!room.ceiling_ht) missing.push(`rooms[${i}].ceiling_ht`);
    });
  }

  const confirmed = new Set(intake?.cultural_confirmed ?? []);
  const cultural_confirmations = config.cultural_rules
    .filter((rule) => rule.default_on && !confirmed.has(rule.id))
    .map((rule) => rule.id);

  return { missing, cultural_confirmations };
}
