import { z } from "zod";

/** Platform-admin (operator back-office) request shapes. */

export const planIds = ["starter", "professional", "studio"] as const;
export type PlanId = (typeof planIds)[number];

export const studioStatuses = ["active", "suspended"] as const;
export type StudioStatus = (typeof studioStatuses)[number];

/** POST /api/admin/studios — provision a studio for an existing account. */
export const createStudioSchema = z.object({
  name: z.string().trim().min(1, "required").max(120),
  owner_email: z.string().trim().toLowerCase().email("enter a valid email"),
  plan: z.enum(planIds).default("starter"),
});

/** PATCH /api/admin/studios/:orgId — change plan and/or lifecycle state. */
export const updateStudioSchema = z
  .object({
    plan: z.enum(planIds).optional(),
    status: z.enum(studioStatuses).optional(),
  })
  .refine((d) => d.plan !== undefined || d.status !== undefined, {
    message: "nothing to update",
  });

/** A studio row as the admin console renders it. */
export type AdminStudio = {
  id: string;
  name: string;
  owner_id: string;
  owner_email: string | null;
  plan: string;
  status: StudioStatus;
  member_count: number;
  created_at: string;
};
