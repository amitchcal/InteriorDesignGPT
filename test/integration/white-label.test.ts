import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asAnon,
  asPostgres,
  asUser,
  cleanupTestUsers,
  ensureTestUsers,
  TEST_USERS,
} from "./db";

const ORG = "cccccccc-0000-4000-8000-000000000001";
const OTHER_ORG = "cccccccc-0000-4000-8000-000000000002";
const HOST = "studio-sharma.example";
const OTHER_HOST = "other.example";

beforeAll(async () => {
  await ensureTestUsers();
  await asPostgres(async (c) => {
    await c.query("delete from organizations where id = any($1::uuid[])", [[ORG, OTHER_ORG]]);
    // owner owns ORG; outsider owns OTHER_ORG. Give ORG some branding.
    await c.query(
      `insert into organizations (id, name, owner_id, brand_name, primary_color)
       values ($1,'Sharma Studio',$2,'Sharma Interiors','#4F46E5')`,
      [ORG, TEST_USERS.owner],
    );
    await c.query(
      "insert into organizations (id, name, owner_id) values ($1,'Outsider Co',$2)",
      [OTHER_ORG, TEST_USERS.outsider],
    );
    await c.query(
      "insert into org_members (org_id, user_id, role) values ($1,$2,'owner'),($3,$4,'owner') on conflict do nothing",
      [ORG, TEST_USERS.owner, OTHER_ORG, TEST_USERS.outsider],
    );
  });
});

afterAll(async () => {
  await asPostgres(async (c) => {
    await c.query("delete from org_domains where org_id = any($1::uuid[])", [[ORG, OTHER_ORG]]);
    await c.query("delete from organizations where id = any($1::uuid[])", [[ORG, OTHER_ORG]]);
  });
  await cleanupTestUsers();
});

describe("org_domains RLS", () => {
  it("the org owner can add a domain; a non-owner cannot", async () => {
    // Owner inserts — succeeds.
    await asUser(TEST_USERS.owner, async (c) => {
      const { rowCount } = await c.query(
        "insert into org_domains (org_id, hostname, status) values ($1,$2,'pending')",
        [ORG, HOST],
      );
      expect(rowCount).toBe(1);
    });

    // A different user cannot add a domain to an org they don't own (with check).
    await asUser(TEST_USERS.designer, async (c) => {
      await expect(
        c.query(
          "insert into org_domains (org_id, hostname, status) values ($1,$2,'pending')",
          [ORG, "sneak.example"],
        ),
      ).rejects.toThrow();
    });
  });

  it("only the owner can read the org's domains", async () => {
    const ownerSees = await asUser(TEST_USERS.owner, async (c) => {
      const { rows } = await c.query("select 1 from org_domains where org_id=$1", [ORG]);
      return rows.length;
    });
    expect(ownerSees).toBeGreaterThan(0);

    const outsiderSees = await asUser(TEST_USERS.outsider, async (c) => {
      const { rows } = await c.query("select 1 from org_domains where org_id=$1", [ORG]);
      return rows.length;
    });
    expect(outsiderSees).toBe(0);
  });

  it("hostname is globally unique — a second org can't claim the same domain", async () => {
    await asUser(TEST_USERS.outsider, async (c) => {
      await expect(
        c.query(
          "insert into org_domains (org_id, hostname, status) values ($1,$2,'pending')",
          [OTHER_ORG, HOST],
        ),
      ).rejects.toThrow(/duplicate|unique/i);
    });
  });
});

describe("resolve_tenant", () => {
  it("returns nothing while the domain is pending", async () => {
    const rows = await asAnon(async (c) => {
      const { rows } = await c.query("select * from resolve_tenant($1)", [HOST]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("returns the org's branding once the domain is active — to an anon caller", async () => {
    await asPostgres(async (c) => {
      await c.query("update org_domains set status='active' where hostname=$1", [HOST]);
    });

    const rows = await asAnon(async (c) => {
      const { rows } = await c.query("select * from resolve_tenant($1)", [HOST]);
      return rows;
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].brand_name).toBe("Sharma Interiors");
    expect(rows[0].primary_color).toBe("#4F46E5");
    expect(rows[0].org_id).toBe(ORG);
  });

  it("falls back to the org name when brand_name is unset", async () => {
    await asPostgres(async (c) => {
      await c.query(
        "insert into org_domains (org_id, hostname, status) values ($1,$2,'active')",
        [OTHER_ORG, OTHER_HOST],
      );
    });
    const rows = await asAnon(async (c) => {
      const { rows } = await c.query("select * from resolve_tenant($1)", [OTHER_HOST]);
      return rows;
    });
    expect(rows[0].brand_name).toBe("Outsider Co"); // coalesced from organizations.name
  });

  it("returns nothing for an unknown host", async () => {
    const rows = await asAnon(async (c) => {
      const { rows } = await c.query("select * from resolve_tenant($1)", ["nobody.example"]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });
});

describe("brand-assets bucket", () => {
  it("exists and is public (logos are shown to un-authed clients)", async () => {
    const isPublic = await asPostgres(async (c) => {
      const { rows } = await c.query(
        "select public from storage.buckets where id='brand-assets'",
      );
      return rows[0]?.public;
    });
    expect(isPublic).toBe(true);
  });
});
