import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  notFound,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { brandingSchema } from "@/types/branding";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/orgs/:id/branding — set white-label branding. Owner only, enforced
 * by RLS (org_write, 0006): a non-owner's UPDATE matches no row.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = brandingSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { data, error } = await ctx.supabase
    .from("organizations")
    .update(parsed.data)
    .eq("id", id)
    .select("id, brand_name, logo_path, primary_color, accent_color")
    .single();

  if (error) {
    // RLS rejected (not the owner) or no such org — both surface as not_found so
    // we don't confirm an org's existence to a non-owner.
    if (error.code === "42501" || error.code === "PGRST116") {
      return notFound("that organization");
    }
    return serverError();
  }

  return NextResponse.json(data);
}
