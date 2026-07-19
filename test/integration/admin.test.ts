import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asPostgres,
  asUser,
  cleanupTestUsers,
  ensureTestUsers,
  TEST_USERS,
} from "./db";

// owner is the seeded platform admin; everyone else is not.
const ADMIN = TEST_USERS.owner;

beforeAll(async () => {
  await ensureTestUsers();
  await asPostgres(async (c) => {
    await c.query(
      "insert into platform_admins (user_id, note) values ($1,'test') on conflict do nothing",
      [ADMIN],
    );
  });
});

afterAll(async () => {
  await asPostgres(async (c) => {
    await c.query("delete from platform_admins where user_id = $1", [ADMIN]);
  });
  await cleanupTestUsers();
});

async function isAdmin(userId: string): Promise<boolean> {
  return asUser(userId, async (c) => {
    const { rows } = await c.query("select is_platform_admin() as ok");
    return rows[0].ok === true;
  });
}

describe("is_platform_admin()", () => {
  it("is true for the seeded admin, false for everyone else", async () => {
    expect(await isAdmin(ADMIN)).toBe(true);
    expect(await isAdmin(TEST_USERS.designer)).toBe(false);
    expect(await isAdmin(TEST_USERS.outsider)).toBe(false);
  });
});

describe("platform_admins RLS", () => {
  it("only an admin can read the admin list", async () => {
    const adminSees = await asUser(ADMIN, async (c) => {
      const { rows } = await c.query("select 1 from platform_admins");
      return rows.length;
    });
    expect(adminSees).toBeGreaterThan(0);

    const outsiderSees = await asUser(TEST_USERS.outsider, async (c) => {
      const { rows } = await c.query("select 1 from platform_admins");
      return rows.length;
    });
    expect(outsiderSees).toBe(0);
  });

  it("nobody — not even an admin — can grant admin through the API", async () => {
    // No INSERT policy exists, so RLS denies the write for the authenticated
    // role regardless of who asks. Admission is service-role / SQL only.
    await asUser(ADMIN, async (c) => {
      await expect(
        c.query("insert into platform_admins (user_id) values ($1)", [TEST_USERS.designer]),
      ).rejects.toThrow();
    });
    await asUser(TEST_USERS.outsider, async (c) => {
      await expect(
        c.query("insert into platform_admins (user_id) values ($1)", [TEST_USERS.outsider]),
      ).rejects.toThrow();
    });
  });
});

describe("organizations.status", () => {
  it("defaults to active and rejects an invalid status", async () => {
    const ORG = "dddddddd-0000-4000-8000-000000000001";
    await asPostgres(async (c) => {
      await c.query("delete from organizations where id=$1", [ORG]);
      await c.query(
        "insert into organizations (id, name, owner_id) values ($1,'S',$2)",
        [ORG, ADMIN],
      );
      const { rows } = await c.query("select status from organizations where id=$1", [ORG]);
      expect(rows[0].status).toBe("active");

      await expect(
        c.query("update organizations set status='banned' where id=$1", [ORG]),
      ).rejects.toThrow();

      await c.query("delete from organizations where id=$1", [ORG]);
    });
  });
});
