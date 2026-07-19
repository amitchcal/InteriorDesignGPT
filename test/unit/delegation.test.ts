import { describe, expect, it } from "vitest";

import {
  assignmentSchema,
  createTaskSchema,
  doneSchema,
  memberLabel,
  updateTaskSchema,
  type TeamMember,
} from "@/types/delegation";

const UID = "aaaaaaaa-0000-4000-8000-000000000001";

describe("assignmentSchema", () => {
  it("accepts a member + date, and null/null to clear", () => {
    expect(assignmentSchema.safeParse({ assignee_id: UID, due_date: "2026-08-01" }).success).toBe(true);
    expect(assignmentSchema.safeParse({ assignee_id: null, due_date: null }).success).toBe(true);
  });

  it("rejects a bad date, bad uuid, or a missing field", () => {
    expect(assignmentSchema.safeParse({ assignee_id: UID, due_date: "Aug 1" }).success).toBe(false);
    expect(assignmentSchema.safeParse({ assignee_id: "nope", due_date: null }).success).toBe(false);
    expect(assignmentSchema.safeParse({ assignee_id: UID }).success).toBe(false);
  });
});

describe("task schemas", () => {
  it("createTaskSchema needs a title; assignee/due optional", () => {
    expect(createTaskSchema.safeParse({ title: "Draw plan" }).success).toBe(true);
    expect(createTaskSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("updateTaskSchema rejects an empty patch", () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
    expect(updateTaskSchema.safeParse({ title: "x" }).success).toBe(true);
  });

  it("doneSchema requires a boolean", () => {
    expect(doneSchema.safeParse({ done: true }).success).toBe(true);
    expect(doneSchema.safeParse({ done: "yes" }).success).toBe(false);
  });
});

describe("memberLabel", () => {
  const base: TeamMember = { user_id: UID, display_name: null, email: null, role: "designer" };
  it("prefers name, then email, then a short id", () => {
    expect(memberLabel({ ...base, display_name: "Priya" })).toBe("Priya");
    expect(memberLabel({ ...base, email: "p@studio.com" })).toBe("p@studio.com");
    expect(memberLabel(base)).toBe("aaaaaaaa…");
  });
});
