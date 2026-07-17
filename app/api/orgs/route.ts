import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";

const createOrgSchema = z.object({
  name: z.string().trim().min(1, "required").max(120),
});

/** GET /api/orgs — orgs the user owns or belongs to (RLS decides which). */
export async function GET() {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { data, error } = await ctx.supabase
    .from("organizations")
    .select("id, name, plan, owner_id, created_at")
    .order("created_at", { ascending: false });

  if (error) return serverError();

  return NextResponse.json({ organizations: data });
}

/** POST /api/orgs — create an org. The creator is its owner. */
export async function POST(request: NextRequest) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = createOrgSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { data, error } = await ctx.supabase
    .from("organizations")
    .insert({ name: parsed.data.name, owner_id: ctx.user.id })
    .select("id, name, plan")
    .single();

  if (error) return serverError();

  // The owner is a member too, so agency-hub reads (Task 12) and is_org_member()
  // treat them uniformly rather than special-casing ownership everywhere.
  const { error: memberError } = await ctx.supabase
    .from("org_members")
    .insert({ org_id: data.id, user_id: ctx.user.id, role: "owner" });

  if (memberError) return serverError();

  return NextResponse.json(data, { status: 201 });
}
