import { NextResponse, type NextRequest } from "next/server";

import { requirePlatformAdmin } from "@/lib/admin/guard";
import { emailIndex, listStudios } from "@/lib/admin/studios";
import { apiError, forbidden, serverError, validationError } from "@/lib/api/errors";
import { getPlan } from "@/lib/billing/plans";
import { createStudioSchema, type AdminStudio } from "@/types/admin";

/** GET /api/admin/studios — every studio across the platform. Admin only. */
export async function GET() {
  const ctx = await requirePlatformAdmin();
  if (!ctx) return forbidden();

  const studios = await listStudios(ctx.admin);
  return NextResponse.json({ studios });
}

/**
 * POST /api/admin/studios — provision a studio for an existing account.
 * v1 attaches an already-signed-up user by email (no invite email is sent). If
 * no account matches, the operator is told to have them sign up first.
 */
export async function POST(request: NextRequest) {
  const ctx = await requirePlatformAdmin();
  if (!ctx) return forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = createStudioSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const { name, owner_email, plan } = parsed.data;

  const emails = await emailIndex(ctx.admin);
  let ownerId: string | null = null;
  for (const [id, email] of emails) if (email.toLowerCase() === owner_email) ownerId = id;

  if (!ownerId) {
    return apiError(
      "validation_error",
      "No account with that email. Ask them to sign up first, then provision the studio.",
      { owner_email: "no account with that email" },
    );
  }

  // Create the org + owner membership with the service client (bypasses RLS).
  const { data: org, error: orgErr } = await ctx.admin
    .from("organizations")
    .insert({ name, owner_id: ownerId, plan, status: "active" })
    .select("id, name, owner_id, plan, status, created_at")
    .single();
  if (orgErr || !org) return serverError();

  const { error: memErr } = await ctx.admin
    .from("org_members")
    .insert({ org_id: org.id, user_id: ownerId, role: "owner" });
  if (memErr) return serverError();

  // Align the owner's existing subscription (created on signup) to the plan.
  const planDef = getPlan(plan);
  if (planDef) {
    await ctx.admin
      .from("subscriptions")
      .update({ plan, quota_projects: planDef.quota_projects })
      .eq("owner_id", ownerId);
  }

  const studio: AdminStudio = {
    id: org.id,
    name: org.name,
    owner_id: org.owner_id,
    owner_email,
    plan: org.plan,
    status: org.status,
    member_count: 1,
    created_at: org.created_at,
  };
  return NextResponse.json(studio, { status: 201 });
}
