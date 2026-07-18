import { defineConfig } from "vitest/config";

/**
 * Unit suite — pure logic, no DB, no network, no LLM. Runs on every build
 * (prebuild), so it must stay fast and deterministic. Integration tests that
 * need local Supabase live in vitest.integration.config.ts.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts"],
    passWithNoTests: false,
  },
});
