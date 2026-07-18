import { defineConfig } from "vitest/config";

/**
 * Integration suite — runs against a LOCAL Supabase (Postgres). It encodes the
 * bugs found during the build as regression tests: RLS policies, SQL functions,
 * grants, seed data. No LLM, no network beyond the local DB.
 *
 * Prerequisite: `supabase start` (and migrations applied). Run with
 * `npm run test:int`. Not part of `prebuild` — a build shouldn't require a DB.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    passWithNoTests: false,
    // Migrations/functions are shared state; keep files serial for clarity.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
