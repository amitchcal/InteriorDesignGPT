import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asPostgres,
  asUser,
  cleanupTestUsers,
  ensureTestUsers,
  TEST_USERS,
} from "./db";

const ORG = "eeeeeeee-0000-4000-8000-000000000001";
const PROJECT = "eeeeeeee-0000-4000-8000-0000000000a1";
const TASK = "eeeeeeee-0000-4000-8000-0000000000b1";

beforeAll(async () => {
  await ensureTestUsers();
  await asPostgres(async (c) => {
    await c.query("delete from organizations where id=$1", [ORG]);
    await c.query(
      "insert into organizations (id, name, owner_id) values ($1,'Studio',$2)",
      [ORG, TEST_USERS.owner],
    );
    await c.query(
      `insert into org_members (org_id, user_id, role) values
         ($1,$2,'owner'),($1,$3,'designer'),($1,$4,'viewer')
       on conflict do nothing`,
      [ORG, TEST_USERS.owner, TEST_USERS.designer, TEST_USERS.viewer],
    );
    // Org project owned (row-wise) by the designer.
    await c.query(
      "insert into projects (id, owner_id, org_id, market_code, name, status) values ($1,$2,$3,'IN','P','draft')",
      [PROJECT, TEST_USERS.designer, ORG],
    );
    // A task on it, assigned to the designer.
    await c.query(
      "insert into project_tasks (id, project_id, title, assignee_id) values ($1,$2,'Draw plan',$3)",
      [TASK, PROJECT, TEST_USERS.designer],
    );
  });
});

afterAll(async () => {
  await asPostgres(async (c) => {
    await c.query("delete from project_tasks where id=$1", [TASK]);
    await c.query("delete from projects where id=$1", [PROJECT]);
    await c.query("delete from organizations where id=$1", [ORG]);
  });
  await cleanupTestUsers();
});

async function canManage(userId: string): Promise<boolean> {
  return asUser(userId, async (c) => {
    const { rows } = await c.query("select can_manage_project($1) as ok", [PROJECT]);
    return rows[0].ok === true;
  });
}

describe("can_manage_project", () => {
  it("is the owner only — not a designer or viewer on an org project", async () => {
    expect(await canManage(TEST_USERS.owner)).toBe(true);
    expect(await canManage(TEST_USERS.designer)).toBe(false);
    expect(await canManage(TEST_USERS.viewer)).toBe(false);
  });
});

describe("assign_project (owner only)", () => {
  it("the owner assigns to a member", async () => {
    const assignee = await asUser(TEST_USERS.owner, async (c) => {
      const { rows } = await c.query(
        "select assignee_id from assign_project($1,$2,$3)",
        [PROJECT, TEST_USERS.designer, "2026-08-01"],
      );
      return rows[0].assignee_id;
    });
    expect(assignee).toBe(TEST_USERS.designer);
  });

  it("a designer cannot assign", async () => {
    await asUser(TEST_USERS.designer, async (c) => {
      await expect(
        c.query("select assign_project($1,$2,null)", [PROJECT, TEST_USERS.designer]),
      ).rejects.toThrow(/forbidden/i);
    });
  });

  it("the owner cannot assign to a non-member", async () => {
    await asUser(TEST_USERS.owner, async (c) => {
      await expect(
        c.query("select assign_project($1,$2,null)", [PROJECT, TEST_USERS.outsider]),
      ).rejects.toThrow(/assignee_not_member/i);
    });
  });
});

describe("project_tasks RLS", () => {
  it("only the owner can create a task", async () => {
    const ownerRows = await asUser(TEST_USERS.owner, async (c) => {
      const { rowCount } = await c.query(
        "insert into project_tasks (project_id, title) values ($1,'x')",
        [PROJECT],
      );
      return rowCount;
    });
    expect(ownerRows).toBe(1);

    await asUser(TEST_USERS.designer, async (c) => {
      await expect(
        c.query("insert into project_tasks (project_id, title) values ($1,'x')", [PROJECT]),
      ).rejects.toThrow();
    });
  });

  it("any member reads tasks; an outsider sees none", async () => {
    const memberSees = await asUser(TEST_USERS.viewer, async (c) => {
      const { rows } = await c.query("select 1 from project_tasks where project_id=$1", [PROJECT]);
      return rows.length;
    });
    expect(memberSees).toBeGreaterThan(0);

    const outsiderSees = await asUser(TEST_USERS.outsider, async (c) => {
      const { rows } = await c.query("select 1 from project_tasks where project_id=$1", [PROJECT]);
      return rows.length;
    });
    expect(outsiderSees).toBe(0);
  });
});

describe("set_task_done", () => {
  it("the assignee may tick their own task; a bystander may not", async () => {
    const done = await asUser(TEST_USERS.designer, async (c) => {
      const { rows } = await c.query("select done from set_task_done($1, true)", [TASK]);
      return rows[0].done;
    });
    expect(done).toBe(true);

    await asUser(TEST_USERS.viewer, async (c) => {
      await expect(
        c.query("select set_task_done($1, true)", [TASK]),
      ).rejects.toThrow(/forbidden/i);
    });
  });

  it("the owner may also tick it", async () => {
    const done = await asUser(TEST_USERS.owner, async (c) => {
      const { rows } = await c.query("select done from set_task_done($1, false)", [TASK]);
      return rows[0].done;
    });
    expect(done).toBe(false);
  });
});

describe("org_team", () => {
  it("a member sees the roster; an outsider sees nothing", async () => {
    const memberCount = await asUser(TEST_USERS.owner, async (c) => {
      const { rows } = await c.query("select count(*)::int as n from org_team($1)", [ORG]);
      return rows[0].n;
    });
    expect(memberCount).toBe(3);

    const outsiderCount = await asUser(TEST_USERS.outsider, async (c) => {
      const { rows } = await c.query("select count(*)::int as n from org_team($1)", [ORG]);
      return rows[0].n;
    });
    expect(outsiderCount).toBe(0);
  });
});
