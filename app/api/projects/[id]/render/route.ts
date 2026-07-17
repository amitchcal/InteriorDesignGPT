import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  notFound,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { getRenderProvider, RenderProviderError } from "@/lib/providers/render";
import { conceptSchema } from "@/types/concept";
import { renderRequestSchema } from "@/types/render";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/render — dispatch a room render (E4-2).
 *
 * Contract: 202 { render_job_id, status: "queued" }. Poll at GET /api/render/:jobId.
 *
 * The route talks only to the RenderProvider interface — it never names a
 * vendor. Provider failure returns 502 provider_error and does not crash the
 * page (Task 10 acceptance).
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

  const parsed = renderRequestSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { data: project } = await ctx.supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!project) return notFound("that project");

  // Prefer the brief from the latest concept for this room; a caller may also
  // pass one directly (api-contracts shows `brief` in the body).
  const { data: latestConcept } = await ctx.supabase
    .from("design_concepts")
    .select("concept")
    .eq("project_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const concept = latestConcept
    ? conceptSchema.safeParse(latestConcept.concept)
    : null;
  const conceptRoom = concept?.success
    ? concept.data.rooms.find((r) => r.name === parsed.data.room)
    : undefined;

  const brief = parsed.data.brief ?? conceptRoom?.render_brief;
  if (!brief) {
    return apiError("validation_error", "No render brief for that room.", {
      room: "generate a concept first, or pass a brief",
    });
  }

  let provider;
  try {
    provider = getRenderProvider();
  } catch {
    // Misconfiguration (missing env) is ours, not the vendor's.
    return serverError();
  }

  // Record the job before dispatch, so a row exists even if the provider throws
  // — the UI can show a failed render rather than nothing.
  // input is always { brief, external_id? } — one shape the poll route can rely
  // on. external_id is the vendor's job handle; kept in input's jsonb so no
  // schema change is needed and no vendor id leaks into a typed column.
  const { data: job, error: insertError } = await ctx.supabase
    .from("render_jobs")
    .insert({
      project_id: id,
      room: parsed.data.room,
      provider: "generative",
      status: "queued",
      input: { brief },
    })
    .select("id")
    .single();
  if (insertError || !job) return serverError();

  try {
    const dispatch = await provider.dispatch({
      room: parsed.data.room,
      brief,
      styleDirection: conceptRoom?.style_direction,
    });

    await ctx.supabase
      .from("render_jobs")
      .update({
        status: dispatch.status,
        input: { brief, external_id: dispatch.external_id },
      })
      .eq("id", job.id);

    return NextResponse.json(
      { render_job_id: job.id, status: "queued" },
      { status: 202 },
    );
  } catch (error) {
    // Provider failure: mark the job failed and return 502 — the page keeps
    // working (Task 10 acceptance).
    await ctx.supabase.from("render_jobs").update({ status: "failed" }).eq("id", job.id);

    if (error instanceof RenderProviderError) {
      return apiError(
        "provider_error",
        "The render service didn't accept the job. Please try again.",
      );
    }
    return serverError();
  }
}
