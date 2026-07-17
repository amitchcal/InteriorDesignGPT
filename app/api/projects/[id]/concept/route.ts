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
import { computeGateFacts } from "@/lib/validation/gate";
import { conceptRequestSchema } from "@/types/concept";
import { intakeSchema } from "@/types/project";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/:id/concept — the latest concept (for the client after a job). */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;
  const { data } = await ctx.supabase
    .from("design_concepts")
    .select("version, concept")
    .eq("project_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return notFound("a concept for this project");

  return NextResponse.json({ version: data.version, concept: data.concept });
}

/**
 * POST /api/projects/:id/concept — enqueue the Concept Engine (E2-1, E2-2, E2-3).
 *
 * Contract: 202 { job_id, status:"queued" }; the client polls GET /api/jobs/:id.
 * The engine runs 2 minutes, so it runs on the worker, not in this request
 * (docs/infra.md). The route stays synchronous and cheap: it checks the gate and
 * enqueues.
 *
 * The gate is re-checked here rather than trusting `projects.status`: status is a
 * snapshot from whenever /validate last ran, and the brief can change after it
 * (a room deleted, a cultural rule flipped). Refusing at enqueue means a bad
 * request fails fast with 422 instead of becoming a job that fails later.
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

  // Single-room re-run needs a concept to carry forward (E2-4).
  if (onlyRoom) {
    const { data: latest } = await ctx.supabase
      .from("design_concepts")
      .select("id")
      .eq("project_id", id)
      .limit(1)
      .maybeSingle();
    if (!latest) {
      return apiError(
        "validation_error",
        "Generate a concept for the whole project first.",
        { room: "no concept to update yet" },
      );
    }
  }

  // Enqueue — the worker runs the engine. enqueue_job checks ownership.
  const { data: jobId, error: enqueueError } = await ctx.supabase.rpc("enqueue_job", {
    p_kind: "concept",
    p_project: id,
    p_payload: onlyRoom ? { room: onlyRoom } : {},
  });
  if (enqueueError || !jobId) return serverError();

  return NextResponse.json({ job_id: jobId, status: "queued" }, { status: 202 });
}
