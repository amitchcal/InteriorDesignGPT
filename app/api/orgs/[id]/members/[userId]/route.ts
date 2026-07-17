import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import { apiError, notFound, serverError, unauthorized } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

/** DELETE /api/orgs/:id/members/:userId — remove a member. Owner only (RLS). */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id, userId } = await params;

  // An org must keep its owner: org_members.role='owner' backs the agency hub
  // and is_org_member(). Removing it would strand the org with no manager,
  // and organizations.owner_id would still point at them — an inconsistent state.
  const { data: target, error: lookupError } = await ctx.supabase
    .from("org_members")
    .select("role")
    .eq("org_id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) return serverError();
  if (!target) return notFound("that member");

  if (target.role === "owner") {
    return apiError(
      "validation_error",
      "An organization can't remove its owner.",
    );
  }

  const { error, count } = await ctx.supabase
    .from("org_members")
    .delete({ count: "exact" })
    .eq("org_id", id)
    .eq("user_id", userId);

  if (error) return serverError();
  // RLS silently filters non-owner deletes to zero rows rather than erroring.
  if (!count) return notFound("that member");

  return new NextResponse(null, { status: 204 });
}
