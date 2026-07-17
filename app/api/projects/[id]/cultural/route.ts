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
import { intakeSchema } from "@/types/project";
import { confirmCulturalSchema } from "@/types/validation";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/projects/:id/cultural — record the user's answer on each cultural rule.
 *
 * Writes back to `intake.cultural_overrides` (build-tasks Task 6) and records
 * the rule id in `intake.cultural_confirmed`, which is what makes it an answer
 * rather than a default the form happened to pre-fill.
 *
 * Not in api-contracts — the contract lists no endpoint for the write-back that
 * Task 6 requires. Added rather than folding it into /validate, which is a read
 * of project state and shouldn't mutate the brief as a side effect.
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

  const parsed = confirmCulturalSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { data: project } = await ctx.supabase
    .from("projects")
    .select("id, market_code, intake")
    .eq("id", id)
    .maybeSingle();
  if (!project) return notFound("that project");

  const profile = await getMarketProfile(project.market_code);
  const known = new Set(profile.config.cultural_rules.map((r) => r.id));

  const unknown = Object.keys(parsed.data.rules).filter((r) => !known.has(r));
  if (unknown.length) {
    return apiError("validation_error", "Some details need a second look.", {
      rules: `not a rule in ${project.market_code}: ${unknown.join(", ")}`,
    });
  }

  const current = intakeSchema.safeParse(project.intake);
  if (!current.success) {
    // The brief is unreadable; confirming a rule on top of it would write a
    // half-valid intake. The gate already reports this as missing fields.
    return apiError("validation_error", "This project's brief can't be read.");
  }

  const intake = {
    ...current.data,
    cultural_overrides: { ...current.data.cultural_overrides, ...parsed.data.rules },
    cultural_confirmed: [
      ...new Set([...current.data.cultural_confirmed, ...Object.keys(parsed.data.rules)]),
    ],
  };

  const { error } = await ctx.supabase
    .from("projects")
    .update({ intake })
    .eq("id", id);
  if (error) return serverError();

  return NextResponse.json({
    ok: true,
    cultural_overrides: intake.cultural_overrides,
    cultural_confirmed: intake.cultural_confirmed,
  });
}
