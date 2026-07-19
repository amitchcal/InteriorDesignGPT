import { NextResponse, type NextRequest } from "next/server";

import { requirePlatformAdmin } from "@/lib/admin/guard";
import {
  apiError,
  forbidden,
  notFound,
  serverError,
  validationError,
} from "@/lib/api/errors";
import { getPlan } from "@/lib/billing/plans";
import { updateStudioSchema } from "@/types/admin";

type RouteContext = { params: Promise<{ orgId: string }> };

/**
 * PATCH /api/admin/studios/:orgId — change a studio's plan and/or lifecycle
 * status. Admin only. A plan change also realigns the owner's subscription
 * quota so project limits track the plan.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const ctx = await requirePlatformAdmin();
  if (!ctx) return forbidden();

  const { orgId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = updateStudioSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const { plan, status } = parsed.data;

  const { data: org, error: fetchErr } = await ctx.admin
    .from("organizations")
    .select("id, owner_id")
    .eq("id", orgId)
    .maybeSingle();
  if (fetchErr) return serverError();
  if (!org) return notFound("that studio");

  const patch: { plan?: string; status?: string } = {};
  if (plan !== undefined) patch.plan = plan;
  if (status !== undefined) patch.status = status;

  const { data: updated, error: updErr } = await ctx.admin
    .from("organizations")
    .update(patch)
    .eq("id", orgId)
    .select("id, name, owner_id, plan, status, created_at")
    .single();
  if (updErr || !updated) return serverError();

  // Keep the owner's subscription quota in step with a plan change.
  if (plan !== undefined) {
    const planDef = getPlan(plan);
    if (planDef) {
      await ctx.admin
        .from("subscriptions")
        .update({ plan, quota_projects: planDef.quota_projects })
        .eq("owner_id", org.owner_id);
    }
  }

  return NextResponse.json(updated);
}
