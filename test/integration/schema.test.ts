import { describe, expect, it } from "vitest";

import { asAnon, asPostgres, asUser, TEST_USERS, ensureTestUsers } from "./db";

/**
 * Seed + schema regression tests. Each guards a specific bug found during the
 * build so it can't silently return.
 */

describe("seed data (bug #1 — migration order)", () => {
  it("seeds IN and US markets", async () => {
    const { rows } = await asPostgres((c) =>
      c.query("select market_code from market_profiles where active order by market_code"),
    );
    expect(rows.map((r) => r.market_code)).toEqual(["IN", "US"]);
  });

  it("seeds 64 IN rate rows with unique item codes", async () => {
    const { rows } = await asPostgres((c) =>
      c.query("select count(*)::int n, count(distinct item_code)::int d from rate_libraries where market_code='IN'"),
    );
    expect(rows[0].n).toBe(64);
    expect(rows[0].d).toBe(64);
  });
});

describe("IN market units (bug #4 — metric/imperial mismatch)", () => {
  it("IN is imperial, matching its per-sqft rate library", async () => {
    const { rows } = await asPostgres((c) =>
      c.query("select config->>'units' u from market_profiles where market_code='IN'"),
    );
    expect(rows[0].u).toBe("imperial");
  });

  it("the IN rate library is priced in imperial units", async () => {
    const { rows } = await asPostgres((c) =>
      c.query("select count(*)::int n from rate_libraries where market_code='IN' and unit in ('sqft','rft')"),
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });
});

describe("table grants (bug #2 — RLS policies without GRANTs)", () => {
  it("authenticated can read reference tables; anon cannot", async () => {
    await ensureTestUsers();
    const authed = await asUser(TEST_USERS.owner, (c) =>
      c.query("select count(*)::int n from market_profiles"),
    );
    expect(authed.rows[0].n).toBeGreaterThan(0);

    // anon has no SELECT privilege on the reference tables.
    await expect(
      asAnon((c) => c.query("select count(*) from market_profiles")),
    ).rejects.toThrow(/permission denied|not authorized|policy/i);
  });

  it("authenticated has DML on user tables (grant present)", async () => {
    const { rows } = await asPostgres((c) =>
      c.query("select has_table_privilege('authenticated','public.projects','INSERT') i"),
    );
    expect(rows[0].i).toBe(true);
  });

  it("reference tables are read-only to authenticated (no INSERT)", async () => {
    const { rows } = await asPostgres((c) =>
      c.query("select has_table_privilege('authenticated','public.rate_libraries','INSERT') i"),
    );
    expect(rows[0].i).toBe(false);
  });
});

describe("storage buckets (bug #5 — missing UPDATE policy)", () => {
  it("all four buckets are private", async () => {
    const { rows } = await asPostgres((c) =>
      c.query("select id, public from storage.buckets order by id"),
    );
    expect(rows.length).toBe(4);
    expect(rows.every((r) => r.public === false)).toBe(true);
  });

  it("every bucket has an UPDATE policy (so upsert/regeneration works)", async () => {
    const { rows } = await asPostgres((c) =>
      c.query("select count(*)::int n from pg_policies where schemaname='storage' and tablename='objects' and cmd='UPDATE'"),
    );
    // fp_update, rn_update, dna_update, pr_update
    expect(rows[0].n).toBeGreaterThanOrEqual(4);
  });
});

describe("signup trigger (profile + subscription)", () => {
  it("a new user gets a profile and a starter subscription", async () => {
    await ensureTestUsers();
    const { rows } = await asPostgres((c) =>
      c.query(
        `select
           exists(select 1 from profiles where user_id=$1) p,
           (select plan from subscriptions where owner_id=$1) plan,
           (select quota_projects from subscriptions where owner_id=$1) q`,
        [TEST_USERS.owner],
      ),
    );
    expect(rows[0].p).toBe(true);
    expect(rows[0].plan).toBe("starter");
    expect(rows[0].q).toBe(10);
  });
});
