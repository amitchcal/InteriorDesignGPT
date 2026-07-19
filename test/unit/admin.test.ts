import { describe, expect, it } from "vitest";

import { createStudioSchema, updateStudioSchema } from "@/types/admin";

describe("createStudioSchema", () => {
  it("accepts a valid studio and defaults the plan to starter", () => {
    const parsed = createStudioSchema.parse({
      name: "Sharma Studio",
      owner_email: "Owner@Studio.com",
    });
    expect(parsed.plan).toBe("starter");
    expect(parsed.owner_email).toBe("owner@studio.com"); // lower-cased
  });

  it("rejects a bad email, empty name, or unknown plan", () => {
    expect(createStudioSchema.safeParse({ name: "S", owner_email: "nope" }).success).toBe(false);
    expect(
      createStudioSchema.safeParse({ name: "", owner_email: "a@b.com" }).success,
    ).toBe(false);
    expect(
      createStudioSchema.safeParse({ name: "S", owner_email: "a@b.com", plan: "enterprise" })
        .success,
    ).toBe(false);
  });
});

describe("updateStudioSchema", () => {
  it("accepts a plan-only or status-only change", () => {
    expect(updateStudioSchema.safeParse({ plan: "studio" }).success).toBe(true);
    expect(updateStudioSchema.safeParse({ status: "suspended" }).success).toBe(true);
  });

  it("rejects an empty patch and invalid values", () => {
    expect(updateStudioSchema.safeParse({}).success).toBe(false);
    expect(updateStudioSchema.safeParse({ status: "banned" }).success).toBe(false);
    expect(updateStudioSchema.safeParse({ plan: "free" }).success).toBe(false);
  });
});
