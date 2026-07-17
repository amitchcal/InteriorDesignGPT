import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

/**
 * Loads engine prompt text from /docs/prompts.
 *
 * CLAUDE.md keeps prompts in markdown rather than string literals so they are
 * reviewable as prose. Each file wraps the actual prompt in a fenced block; the
 * surrounding markdown is commentary for humans and must not reach the model.
 */
const PROMPTS_DIR = path.join(process.cwd(), "docs", "prompts");

export class PromptNotFoundError extends Error {
  constructor(name: string) {
    super(`No prompt file at docs/prompts/${name}.md`);
    this.name = "PromptNotFoundError";
  }
}

/**
 * Returns the contents of the file's first fenced code block.
 *
 * Engine prompts are large and stable — exactly what prompt caching is for
 * (docs/infra.md calls it the single biggest cost lever), so this is cached per
 * request and the text is stable across requests for a cache_control breakpoint.
 */
export const loadPrompt = cache(async (name: string): Promise<string> => {
  let raw: string;
  try {
    raw = await readFile(path.join(PROMPTS_DIR, `${name}.md`), "utf8");
  } catch {
    throw new PromptNotFoundError(name);
  }

  const fenced = raw.match(/```(?:\w+)?\n([\s\S]*?)```/);
  if (!fenced) {
    throw new Error(
      `docs/prompts/${name}.md has no fenced prompt block — the engine would ` +
        `otherwise send the file's commentary to the model.`,
    );
  }

  return fenced[1].trim();
});

/** master.md is prepended to engine calls (CLAUDE.md non-negotiable #4). */
export const loadMasterPrompt = cache(() => loadPrompt("master"));
