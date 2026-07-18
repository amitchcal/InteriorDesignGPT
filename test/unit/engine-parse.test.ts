import { describe, expect, it } from "vitest";
import { z } from "zod";

import { EngineOutputError, parseEngineJson } from "@/lib/engines/client";
import { loadMasterPrompt, loadPrompt, PromptNotFoundError } from "@/lib/engines/prompt";

const schema = z.object({ a: z.number(), b: z.string() });

describe("parseEngineJson", () => {
  it("parses clean JSON", () => {
    expect(parseEngineJson('{"a":1,"b":"x"}', schema)).toEqual({ a: 1, b: "x" });
  });

  it("strips a ```json fence the model sometimes adds", () => {
    expect(parseEngineJson('```json\n{"a":1,"b":"x"}\n```', schema)).toEqual({ a: 1, b: "x" });
  });

  it("throws EngineOutputError on non-JSON", () => {
    expect(() => parseEngineJson("sorry, I can't do that", schema)).toThrow(EngineOutputError);
  });

  it("throws EngineOutputError when the shape doesn't match the schema", () => {
    // provider worked, output isn't the contract — must never be persisted
    expect(() => parseEngineJson('{"a":"not a number","b":"x"}', schema)).toThrow(EngineOutputError);
  });
});

describe("loadPrompt", () => {
  it("returns the fenced block, not the file's commentary", async () => {
    // Every engine prompt file must have a sendable fenced block (the defect I
    // kept finding). Exercise a real one.
    const text = await loadPrompt("boq-engine");
    expect(text.length).toBeGreaterThan(50);
    // The commentary above the fence must not leak into what's sent.
    expect(text).not.toContain("Restructured 2026");
  });

  it("master prompt loads", async () => {
    const master = await loadMasterPrompt();
    expect(master.length).toBeGreaterThan(20);
  });

  it("throws PromptNotFoundError for a missing prompt", async () => {
    await expect(loadPrompt("no-such-prompt")).rejects.toBeInstanceOf(PromptNotFoundError);
  });

  it("every engine prompt file has a sendable fenced block", async () => {
    for (const name of ["validation-gate", "concept-engine", "boq-engine", "proposal-engine", "dna-engine", "floorplan-parse"]) {
      const text = await loadPrompt(name);
      expect(text.trim().length, `${name} has an empty prompt`).toBeGreaterThan(30);
    }
  });
});
