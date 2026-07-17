import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  notFound,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";

const addMemberSchema = z.object({
  user_id: z.string().uuid("must be a user id"),
  role: z.enum(["owner", "designer", "viewer"]).default("designer"),
});

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/orgs/:id/members — owner sees all; a member sees only themselves. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  const { data, error } = await ctx.supabase
    .from("org_members")
    .select("org_id, user_id, role")
    .eq("org_id", id);

  if (error) return serverError();

  return NextResponse.json({ members: data });
}

/** POST /api/orgs/:id/members — add a member. Owner only, enforced by RLS. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { data, error } = await ctx.supabase
    .from("org_members")
    .upsert(
      { org_id: id, user_id: parsed.data.user_id, role: parsed.data.role },
      { onConflict: "org_id,user_id" },
    )
    .select("org_id, user_id, role")
    .single();

  if (error) {
    // RLS rejected the write (not the owner), or the org doesn't exist. Both
    // surface as not_found: confirming an org exists to a non-owner would leak
    // its existence.
    if (error.code === "42501" || error.code === "PGRST116") {
      return notFound("that organization");
    }
    // FK violation — the user_id isn't a real account.
    if (error.code === "23503") {
      return validationError(
        new z.ZodError([
          {
            code: "custom",
            path: ["user_id"],
            message: "no account with that id",
          },
        ]),
      );
    }
    return serverError();
  }

  return NextResponse.json(data, { status: 201 });
}
