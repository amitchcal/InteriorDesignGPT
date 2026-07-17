import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * The one Anthropic client. Per CLAUDE.md, no route calls the API inline —
 * everything goes through /lib/engines/*.
 */

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is not set"),
});

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (typeof window !== "undefined") {
    throw new Error("Engines are server-only — the API key must never ship to a browser.");
  }
  if (!client) {
    const { ANTHROPIC_API_KEY } = envSchema.parse({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    });
    client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  }
  return client;
}

/** Models, per CLAUDE.md's stack section. */
export const MODELS = {
  /** Concept, BOQ, Proposal, DNA, and floor-plan vision. */
  reasoning: "claude-sonnet-4-6",
  /** Validation/intake gate — cheap (docs/infra.md: keep cheap tasks off Sonnet). */
  gate: "claude-haiku-4-5",
  /** Optional escalation for hard design reasoning. */
  escalation: "claude-opus-4-8",
} as const;

/**
 * Raised when the provider fails. Routes map this to `502 provider_error` so a
 * vendor outage never surfaces as a 500 (api-contracts.md).
 */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

/**
 * Raised when the model returned something that isn't the agreed schema.
 * Separate from EngineError: the provider worked, the output didn't validate,
 * and CLAUDE.md requires we never persist unvalidated engine output.
 */
export class EngineOutputError extends Error {
  constructor(
    message: string,
    readonly raw?: string,
  ) {
    super(message);
    this.name = "EngineOutputError";
  }
}

/**
 * Parses an engine's JSON reply.
 *
 * Structured outputs (`output_config.format`) aren't available on
 * `claude-sonnet-4-6`, so the prompts demand bare JSON and we validate here.
 * The fence-stripping is a concession to reality: prompts say "no markdown
 * fences" and models mostly comply, but a stray fence shouldn't fail a job that
 * otherwise returned perfectly good data.
 */
export function parseEngineJson<T>(text: string, schema: z.ZodType<T>): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new EngineOutputError("Engine did not return JSON.", text.slice(0, 500));
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new EngineOutputError(
      `Engine output failed validation: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      text.slice(0, 500),
    );
  }

  return result.data;
}
