import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asPostgres,
  asUser,
  cleanupTestUsers,
  ensureTestUsers,
  pool,
  TEST_USERS,
} from "./db";

const ORG = "cccccccc-0000-4000-8000-000000000001";

beforeAll(async () => {
  await ensureTestUsers();
  await asPostgres(async (c) => {
    await c.query("delete from organizations where id=$1", [ORG]);
    await c.query("insert into organizations (id,name,owner_id) values ($1,'Fn Studio',$2)", [ORG, TEST_USERS.owner]);
    await c.query(
      `insert into org_members (org_id,user_id,role) values ($1,$2,'owner'),($1,$3,'designer'),($1,$4,'viewer') on conflict do nothing`,
      [ORG, TEST_USERS.owner, TEST_USERS.designer, TEST_USERS.viewer],
    );
  });
});

afterAll(async () => {
  await asPostgres(async (c) => {
    await c.query("delete from jobs where owner_id = any($1::uuid[])", [Object.values(TEST_USERS)]);
    await c.query("delete from projects where owner_id = any($1::uuid[])", [Object.values(TEST_USERS)]);
    await c.query("delete from organizations where id=$1", [ORG]);
  });
  await cleanupTestUsers();
});

describe("create_project — quota (E5-3)", () => {
  it("blocks creation at the quota limit", async () => {
    await asUser(TEST_USERS.designer, async (c) => {
      // Fill to the starter quota of 10 within this rolled-back transaction.
      await c.query(
        "insert into projects (owner_id, market_code, name) select $1,'IN','fill '||g from generate_series(1,10) g",
        [TEST_USERS.designer],
      );
      await expect(
        c.query("select create_project('over','IN','{}'::jsonb, null)"),
      ).rejects.toThrow(/quota_exceeded/);
    });
  });

  it("allows creation below the quota and increments used_projects", async () => {
    await asUser(TEST_USERS.designer, async (c) => {
      const { rows } = await c.query("select (create_project('ok','IN','{}'::jsonb, null)).id as id");
      expect(rows[0].id).toBeTruthy();
      const used = await c.query("select used_projects from subscriptions where owner_id=$1", [TEST_USERS.designer]);
      expect(used.rows[0].used_projects).toBe(1);
    });
  });
});

describe("create_project — org editor check (bug #8, API path)", () => {
  it("a designer can create a project in the org", async () => {
    await asUser(TEST_USERS.designer, async (c) => {
      const { rows } = await c.query("select (create_project('org proj','IN','{}'::jsonb, $1)).org_id as org", [ORG]);
      expect(rows[0].org).toBe(ORG);
    });
  });

  it("a viewer CANNOT create a project in the org", async () => {
    await asUser(TEST_USERS.viewer, async (c) => {
      await expect(
        c.query("select create_project('sneak','IN','{}'::jsonb, $1)", [ORG]),
      ).rejects.toThrow(/forbidden_org/);
    });
  });
});

describe("enqueue authorization", () => {
  it("enqueue_job requires ownership of the project", async () => {
    // A project owned by the designer; the outsider cannot enqueue against it.
    const projectId = await asPostgres(async (c) => {
      const { rows } = await c.query(
        "insert into projects (owner_id, market_code, name) values ($1,'IN','enq') returning id",
        [TEST_USERS.designer],
      );
      return rows[0].id as string;
    });

    await asUser(TEST_USERS.outsider, async (c) => {
      await expect(
        c.query("select enqueue_job('concept', $1, '{}'::jsonb)", [projectId]),
      ).rejects.toThrow(/forbidden/);
    });

    await asPostgres((c) => c.query("delete from projects where id=$1", [projectId]));
  });
});

describe("claim_job — FOR UPDATE SKIP LOCKED (the queue's core guarantee)", () => {
  it("two concurrent workers never claim the same job", async () => {
    // Enqueue two committed jobs (need a real project for the FK).
    const { projectId, jobs } = await asPostgres(async (c) => {
      const p = await c.query(
        "insert into projects (owner_id, market_code, name) values ($1,'IN','claimtest') returning id",
        [TEST_USERS.designer],
      );
      const projectId = p.rows[0].id as string;
      const j = await c.query(
        "insert into jobs (project_id, owner_id, kind) values ($1,$2,'concept'),($1,$2,'concept') returning id",
        [projectId, TEST_USERS.designer],
      );
      return { projectId, jobs: j.rows.map((r) => r.id as string) };
    });

    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      await c1.query("begin");
      await c2.query("begin");
      // Worker 1 claims one job; the row is locked. Worker 2 must SKIP it and
      // take the other — never the same one.
      const r1 = await c1.query("select id from claim_job('w1')");
      const r2 = await c2.query("select id from claim_job('w2')");
      const claimed1 = r1.rows[0]?.id;
      const claimed2 = r2.rows[0]?.id;
      expect(claimed1).toBeTruthy();
      expect(claimed2).toBeTruthy();
      expect(claimed1).not.toBe(claimed2);
      expect(jobs).toContain(claimed1);
      expect(jobs).toContain(claimed2);
    } finally {
      await c1.query("rollback").catch(() => {});
      await c2.query("rollback").catch(() => {});
      c1.release();
      c2.release();
      await asPostgres((c) => c.query("delete from projects where id=$1", [projectId]));
    }
  });
});
