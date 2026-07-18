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
import { intakeSchema } from "@/types/project";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /** Null detaches any current DNA. */
  dna_id: z.string().uuid().nullable(),
});

/**
 * PUT /api/projects/:id/dna — attach (or detach) a Designer-DNA profile.
 *
 * Writes intake.dna_id; the Concept Engine picks it up on the next run (E2-5).
 * Not in api-contracts — build-tasks says "let a project reference a dna_id"
 * with no endpoint named.
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { data: project } = await ctx.supabase
    .from("projects")
    .select("id, intake")
    .eq("id", id)
    .maybeSingle();
  if (!project) return notFound("that project");

  // The DNA must be one the user owns — RLS on designer_dna_profiles means a
  // profile they can't see returns nothing here.
  if (parsed.data.dna_id) {
    const { data: dna } = await ctx.supabase
      .from("designer_dna_profiles")
      .select("id")
      .eq("id", parsed.data.dna_id)
      .maybeSingle();
    if (!dna) return notFound("that DNA profile");
  }

  const intake = intakeSchema.safeParse(project.intake);
  if (!intake.success) {
    return apiError("validation_error", "This project's brief can't be read.");
  }

  const { error } = await ctx.supabase
    .from("projects")
    .update({ intake: { ...intake.data, dna_id: parsed.data.dna_id } })
    .eq("id", id);
  if (error) return serverError();

  return NextResponse.json({ ok: true, dna_id: parsed.data.dna_id });
}
