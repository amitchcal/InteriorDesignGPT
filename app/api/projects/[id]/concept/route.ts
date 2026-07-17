import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  notFound,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { EngineError, EngineOutputError } from "@/lib/engines/client";
import { runConceptEngine } from "@/lib/engines/concept";
import { getMarketProfile } from "@/lib/market";
import { computeGateFacts } from "@/lib/validation/gate";
import { conceptRequestSchema, conceptSchema, type Concept } from "@/types/concept";
import { intakeSchema } from "@/types/project";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/concept — run the Concept Engine (E2-1, E2-2, E2-3).
 *
 * Contract: 201 { version, concept }. Refuses while the gate is not ok -> 422.
 *
 * The gate is re-run here rather than trusting `projects.status`: status is a
 * snapshot from whenever /validate last ran, and the brief can change after it
 * (a room deleted, a cultural rule flipped). This engine costs real money and
 * produces a document a client sees, so it checks the facts at the moment it
 * spends rather than believing a stale flag. That is what "engines must refuse
 * to run while ok=false" has to mean to be worth anything.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  let body: unknown = {};
  try {
    const raw = await request.text();
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsedBody = conceptRequestSchema.safeParse(body);
  if (!parsedBody.success) return validationError(parsedBody.error);

  const { data: project } = await ctx.supabase
    .from("projects")
    .select("id, market_code, intake, status")
    .eq("id", id)
    .maybeSingle();
  if (!project) return notFound("that project");

  const { data: roomRows, error: roomsError } = await ctx.supabase
    .from("rooms")
    .select("name, length, width, ceiling_ht, unit, meta")
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

  // Pre-req: latest validate ok=true (build-tasks Task 7).
  const facts = computeGateFacts({ config: profile.config, intake, rooms });
  if (facts.missing.length || facts.cultural_confirmations.length) {
    return apiError(
      "validation_error",
      "This brief isn't ready for a concept yet.",
      {
        ...(facts.missing.length && { missing: facts.missing.join(", ") }),
        ...(facts.cultural_confirmations.length && {
          cultural_confirmations: facts.cultural_confirmations.join(", "),
        }),
      },
    );
  }
  if (!intake) return serverError(); // unreachable: facts would have reported it

  const onlyRoom = parsedBody.data.room ?? null;
  if (onlyRoom && !rooms.some((r) => r.name === onlyRoom)) {
    return apiError("validation_error", "That room isn't in this project.", {
      room: "not a room in this project",
    });
  }

  // Latest concept — the base a single-room re-run carries forward (E2-4).
  const { data: latest } = await ctx.supabase
    .from("design_concepts")
    .select("version, concept")
    .eq("project_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (onlyRoom && !latest) {
    return apiError(
      "validation_error",
      "Generate a concept for the whole project first.",
      { room: "no concept to update yet" },
    );
  }

  let generated: Concept;
  try {
    generated = await runConceptEngine({
      market_profile: profile.config,
      intake: {
        floor_plan: rooms,
        client_brief: intake.client_brief,
        preferences: intake.preferences,
        cultural_overrides: intake.cultural_overrides,
      },
      only_room: onlyRoom,
    });
  } catch (error) {
    if (error instanceof EngineOutputError) {
      // Provider worked, output wasn't the agreed schema. Not a vendor fault,
      // and nothing is persisted — CLAUDE.md forbids storing unvalidated output.
      return apiError(
        "provider_error",
        "The concept came back in an unexpected shape. Please try again.",
      );
    }
    if (error instanceof EngineError) {
      return apiError(
        "provider_error",
        "We couldn't generate a concept just now. Please try again.",
      );
    }
    return serverError();
  }

  // Merge a single-room re-run into the previous version rather than replacing
  // the project's concept with one room (E2-4).
  let concept: Concept = generated;
  if (onlyRoom && latest) {
    const base = conceptSchema.safeParse(latest.concept);
    if (!base.success) return serverError();
    const fresh = generated.rooms.find((r) => r.name === onlyRoom) ?? generated.rooms[0];
    concept = {
      ...base.data,
      rooms: base.data.rooms.map((r) => (r.name === onlyRoom ? fresh : r)),
      assumptions: base.data.assumptions,
    };
  }

  const version = (latest?.version ?? 0) + 1;

  const { error: insertError } = await ctx.supabase
    .from("design_concepts")
    .insert({ project_id: id, version, concept });
  if (insertError) return serverError();

  if (project.status === "validated") {
    await ctx.supabase.from("projects").update({ status: "concept" }).eq("id", id);
  }

  return NextResponse.json({ version, concept }, { status: 201 });
}
