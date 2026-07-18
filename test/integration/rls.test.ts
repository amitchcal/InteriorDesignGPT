import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asPostgres,
  asUser,
  cleanupTestUsers,
  ensureTestUsers,
  TEST_USERS,
} from "./db";

const ORG = "bbbbbbbb-0000-4000-8000-000000000001";
const ORG_PROJECT = "bbbbbbbb-0000-4000-8000-0000000000a1";
const OWNER_PERSONAL = "bbbbbbbb-0000-4000-8000-0000000000a2";

beforeAll(async () => {
  await ensureTestUsers();
  // Agency: owner owns the org; designer + viewer are members. Designer creates
  // an org project; owner has a personal (non-org) project.
  await asPostgres(async (c) => {
    await c.query("delete from organizations where id=$1", [ORG]);
    await c.query(
      "insert into organizations (id, name, owner_id) values ($1,'Test Studio',$2)",
      [ORG, TEST_USERS.owner],
    );
    await c.query(
      `insert into org_members (org_id, user_id, role) values
         ($1,$2,'owner'),($1,$3,'designer'),($1,$4,'viewer')
       on conflict do nothing`,
      [ORG, TEST_USERS.owner, TEST_USERS.designer, TEST_USERS.viewer],
    );
    await c.query(
      "insert into projects (id, owner_id, org_id, market_code, name, status) values ($1,$2,$3,'IN','Org project','draft')",
      [ORG_PROJECT, TEST_USERS.designer, ORG],
    );
    await c.query(
      "insert into projects (id, owner_id, market_code, name, status) values ($1,$2,'IN','Owner personal','draft')",
      [OWNER_PERSONAL, TEST_USERS.owner],
    );
  });
});

afterAll(async () => {
  await asPostgres(async (c) => {
    await c.query("delete from projects where id = any($1::uuid[])", [[ORG_PROJECT, OWNER_PERSONAL]]);
    await c.query("delete from organizations where id=$1", [ORG]);
  });
  await cleanupTestUsers();
});

async function canSee(userId: string, projectId: string): Promise<boolean> {
  return asUser(userId, async (c) => {
    const { rows } = await c.query("select 1 from projects where id=$1", [projectId]);
    return rows.length > 0;
  });
}

async function rowsUpdated(userId: string, projectId: string): Promise<number> {
  return asUser(userId, async (c) => {
    const { rowCount } = await c.query("update projects set name='edited' where id=$1", [projectId]);
    return rowCount ?? 0;
  });
}

describe("project isolation (bug #3 — RLS recursion / cross-user reads)", () => {
  it("the org tables are readable without infinite recursion", async () => {
    // The original org_read/orgmem_read policies recursed. A plain select from
    // organizations as a member must not error.
    await expect(
      asUser(TEST_USERS.owner, (c) => c.query("select 1 from organizations")),
    ).resolves.toBeDefined();
  });

  it("an outsider sees neither the org project nor the owner's personal project", async () => {
    expect(await canSee(TEST_USERS.outsider, ORG_PROJECT)).toBe(false);
    expect(await canSee(TEST_USERS.outsider, OWNER_PERSONAL)).toBe(false);
  });

  it("the owner sees their own personal project", async () => {
    expect(await canSee(TEST_USERS.owner, OWNER_PERSONAL)).toBe(true);
  });
});

describe("agency hub (E5-5, bug #8 — viewer must be read-only)", () => {
  it("owner and designer and viewer all SEE the org project", async () => {
    expect(await canSee(TEST_USERS.owner, ORG_PROJECT)).toBe(true);
    expect(await canSee(TEST_USERS.designer, ORG_PROJECT)).toBe(true);
    expect(await canSee(TEST_USERS.viewer, ORG_PROJECT)).toBe(true);
  });

  it("a designer CAN edit an org project", async () => {
    expect(await rowsUpdated(TEST_USERS.designer, ORG_PROJECT)).toBe(1);
  });

  it("a viewer CANNOT edit an org project", async () => {
    expect(await rowsUpdated(TEST_USERS.viewer, ORG_PROJECT)).toBe(0);
  });

  it("a viewer CANNOT inject a project into the org (owner_id bypass closed)", async () => {
    await expect(
      asUser(TEST_USERS.viewer, (c) =>
        c.query(
          "insert into projects (owner_id, org_id, market_code, name) values ($1,$2,'IN','sneak')",
          [TEST_USERS.viewer, ORG],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("an outsider cannot edit the org project", async () => {
    expect(await rowsUpdated(TEST_USERS.outsider, ORG_PROJECT)).toBe(0);
  });
});
