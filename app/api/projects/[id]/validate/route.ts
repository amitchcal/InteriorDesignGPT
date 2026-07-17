import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import { notFound, serverError, unauthorized } from "@/lib/api/errors";
import { EngineError, EngineOutputError } from "@/lib/engines/client";
import { runValidationGate } from "@/lib/engines/validation";
import { getMarketProfile } from "@/lib/market";
import { computeGateFacts } from "@/lib/validation/gate";
import { intakeSchema } from "@/types/project";
import { validationResultSchema } from "@/types/validation";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/validate — the gate (E6-3).
 *
 * Contract: 200 { ok, missing[], cultural_confirmations[] }.
 * Engines refuse to run while ok=false.
 *
 * On the two answers here:
 *
 * `missing` and `cultural_confirmations` are computed in code, not taken from
 * the model. Both are mechanical lookups — a field is present or it isn't — and
 * this gate's entire job is to be right about them: a false "ok" spends Sonnet
 * on an incomplete brief and ships a costed proposal built on a budget nobody
 * entered. A gate that is usually right is not a gate.
 *
 * The Haiku call still runs, as CLAUDE.md specifies. It supplies the
 * normalization the prompt also asks for (`normalized_units`,
 * `style_pref_normalized`), which genuinely wants a model, and its verdict on
 * the mechanical fields is compared against the computed one — a disagreement
 * means the prompt and the code have drifted apart, and it's logged rather than
 * silently trusted either way.
 *
 * If the provider is down the gate still answers, because a vendor outage must
 * not be able to unblock an incomplete project (nor block a complete one).
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  const { data: project } = await ctx.supabase
    .from("projects")
    .select("id, market_code, intake, status")
    .eq("id", id)
    .maybeSingle();
  if (!project) return notFound("that project");

  const { data: roomRows, error: roomsError } = await ctx.supabase
    .from("rooms")
    .select("name, ceiling_ht")
    .eq("project_id", id);
  if (roomsError) return serverError();

  let profile;
  try {
    profile = await getMarketProfile(project.market_code);
  } catch {
    return serverError();
  }

  const parsedIntake = intakeSchema.safeParse(project.intake);
  const intake = parsedIntake.success ? parsedIntake.data : null;
  const rooms = roomRows ?? [];

  const facts = computeGateFacts({ config: profile.config, intake, rooms });

  // A brief that doesn't even parse is missing everything the schema requires;
  // computeGateFacts already reports that from a null intake.
  const ok = facts.missing.length === 0 && facts.cultural_confirmations.length === 0;

  let normalized_units: string | null = profile.config.units;
  let style_pref_normalized: string | null = null;

  try {
    const engine = await runValidationGate({
      market_profile: profile.config,
      intake: {
        market_code: project.market_code,
        client_brief: intake?.client_brief
          ? {
              budget_total: intake.client_brief.budget_total_minor,
              ceiling_height: intake.client_brief.ceiling_height,
              ceiling_height_unit: intake.client_brief.ceiling_height_unit,
              notes: intake.client_brief.notes,
            }
          : null,
        preferences: { finish_tier: intake?.preferences?.tier ?? null },
        cultural_overrides: intake?.cultural_overrides ?? {},
        cultural_confirmed: intake?.cultural_confirmed ?? [],
      },
      rooms: rooms.map((r) => ({ name: r.name, ceiling_ht: r.ceiling_ht })),
    });

    normalized_units = engine.normalized_units ?? profile.config.units;
    style_pref_normalized = engine.style_pref_normalized ?? null;

    const same = (a: string[], b: string[]) =>
      a.length === b.length && [...a].sort().join() === [...b].sort().join();

    if (
      !same(engine.missing, facts.missing) ||
      !same(engine.cultural_confirmations, facts.cultural_confirmations)
    ) {
      // Not fatal — the computed answer is authoritative — but it means the
      // prompt and lib/validation/gate.ts no longer describe the same rules.
      console.warn("[validate] gate disagreement", {
        project: id,
        engine: {
          missing: engine.missing,
          cultural: engine.cultural_confirmations,
        },
        computed: facts,
      });
    }
  } catch (error) {
    if (!(error instanceof EngineError || error instanceof EngineOutputError)) {
      return serverError();
    }
    // Normalization is a nice-to-have; the gate's verdict does not depend on it.
    console.warn("[validate] engine unavailable, using computed gate", {
      project: id,
      reason: error.message,
    });
  }

  // 'validated' is the precondition Task 7 checks. Only ever move a draft
  // forward — a project already at 'concept' or beyond must not be dragged back
  // to 'validated' by a re-run.
  if (ok && project.status === "draft") {
    await ctx.supabase.from("projects").update({ status: "validated" }).eq("id", id);
  }

  return NextResponse.json(
    validationResultSchema.parse({
      ok,
      missing: facts.missing,
      cultural_confirmations: facts.cultural_confirmations,
      normalized_units,
      style_pref_normalized,
    }),
  );
}
