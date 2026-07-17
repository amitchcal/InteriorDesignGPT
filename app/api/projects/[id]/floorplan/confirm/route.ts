import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  notFound,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { getMarketProfile } from "@/lib/market";
import { confirmSchema } from "@/types/floorplan";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/projects/:id/floorplan/confirm
 *
 * Writes the user-corrected rooms and marks the plan confirmed.
 * `floor_plan_id` is optional: the manual-entry path (E1-5) has no parsed plan
 * behind it, and requiring one would make the fallback depend on the thing it
 * exists to work around.
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id: projectId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { data: project } = await ctx.supabase
    .from("projects")
    .select("id, market_code")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return notFound("that project");

  // Rooms must be in the market's unit — master.md: "never mix metric/imperial".
  // Catching it here keeps a mixed-unit project from ever reaching the BOQ.
  const profile = await getMarketProfile(project.market_code);
  const expectedUnit = profile.config.units === "metric" ? "m" : "ft";
  const wrongUnit = parsed.data.rooms.findIndex((r) => r.unit !== expectedUnit);
  if (wrongUnit !== -1) {
    return apiError("validation_error", "Some details need a second look.", {
      [`rooms.${wrongUnit}.unit`]: `${project.market_code} uses ${expectedUnit}`,
    });
  }

  if (parsed.data.floor_plan_id) {
    const { data: plan } = await ctx.supabase
      .from("floor_plans")
      .select("id")
      .eq("id", parsed.data.floor_plan_id)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!plan) return notFound("that floor plan");
  }

  // Confirming replaces the room schedule — re-confirming after a correction
  // must not leave the previous attempt's rooms behind.
  const { error: deleteError } = await ctx.supabase
    .from("rooms")
    .delete()
    .eq("project_id", projectId);
  if (deleteError) return serverError();

  const { error: insertError } = await ctx.supabase.from("rooms").insert(
    parsed.data.rooms.map((room) => ({
      project_id: projectId,
      name: room.name,
      length: room.length,
      width: room.width,
      ceiling_ht: room.ceiling_ht ?? null,
      unit: room.unit,
      meta: room.meta,
    })),
  );
  if (insertError) return serverError();

  if (parsed.data.floor_plan_id) {
    const { error: confirmError } = await ctx.supabase
      .from("floor_plans")
      .update({ confirmed: true })
      .eq("id", parsed.data.floor_plan_id);
    if (confirmError) return serverError();
  }

  return NextResponse.json({ ok: true });
}
