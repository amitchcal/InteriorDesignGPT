# Tests

Two suites, split by what they need to run.

## Unit — `npm test`

Pure logic: money formatting, the BOQ cost recompute (the revenue wedge), the
validation gate, plan/provider routing, and every zod schema. No DB, no network,
no LLM. Fast and deterministic.

**Runs on every build.** `prebuild` is `vitest run && tsc --noEmit`, and npm runs
`prebuild` before `build` automatically — so a failing test or a type error
blocks the build, on Vercel included. Verified: a broken test makes `prebuild`
exit non-zero.

## Integration — `npm run test:int`

RLS policies, SQL functions, grants, and seed data, against a **local Supabase**.
Each test encodes a bug found during the build so it can't silently return:

| Bug | Guarded by |
|---|---|
| #1 migration seed order | markets IN+US, 64 IN rates |
| #2 RLS without GRANTs | authenticated reads / anon denied; DML privileges |
| #3 RLS recursion | org tables readable; cross-user isolation |
| #4 IN metric/imperial | IN profile is imperial, matching its sqft rates |
| #5 storage missing UPDATE | four private buckets, each with an UPDATE policy |
| #8 viewer can edit | viewer read-only; sneak-insert blocked (RLS + `create_project`) |
| queue double-claim | `claim_job` FOR UPDATE SKIP LOCKED — two workers, distinct jobs |

Not part of `prebuild`: a build must not require a running database. Run it
locally or in CI where Supabase is up.

**Prerequisite:** `npx supabase start` (migrations applied). Override the
connection with `TEST_DATABASE_URL` if your local DB port differs from the
Supabase default.

## Everything — `npm run test:all`

Unit then integration. Use before a release.

## Not covered here, on purpose

Live LLM and render calls. They cost money, are slow, and are non-deterministic —
wrong for a build gate. The engine parse/validate/recompute logic is covered with
fixtures instead; the live pipeline was verified by hand during the build.
