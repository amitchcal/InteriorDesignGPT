import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import { apiError, notFound, serverError, unauthorized } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/:id/boq — the latest BOQ (for the client after a job). */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;
  const { data: summary } = await ctx.supabase
    .from("boq_summaries")
    .select("version, subtotal_minor, tax_minor, total_minor, currency, budget_delta_minor, value_eng")
    .eq("project_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!summary) return notFound("a BOQ for this project");

  const { data: items } = await ctx.supabase
    .from("boq_items")
    .select("id, room, item_code, spec, qty, unit, rate_minor, amount_minor, tier")
    .eq("project_id", id)
    .eq("version", summary.version)
    .order("room");

  return NextResponse.json({
    version: summary.version,
    items: (items ?? []).map((i) => ({ ...i, qty: Number(i.qty) })),
    summary: {
      subtotal_minor: summary.subtotal_minor,
      tax_minor: summary.tax_minor,
      total_minor: summary.total_minor,
      currency: summary.currency,
      budget_delta_minor: summary.budget_delta_minor,
      value_engineering: summary.value_eng ?? [],
    },
  });
}

/**
 * POST /api/projects/:id/boq — enqueue the BOQ engine over the latest concept
 * (E3-1..E3-4).
 *
 * Contract: 202 { job_id, status:"queued" }; poll GET /api/jobs/:id. The engine
 * runs 3-4 minutes (the longest in the app), so it runs on the worker
 * (docs/infra.md). The route just checks a concept exists and enqueues; the
 * heavy load — rates, engine call, arithmetic recompute — is in the handler.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  const { data: project } = await ctx.supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!project) return notFound("that project");

  const { data: latestConcept } = await ctx.supabase
    .from("design_concepts")
    .select("id")
    .eq("project_id", id)
    .limit(1)
    .maybeSingle();
  if (!latestConcept) {
    return apiError("validation_error", "Generate a concept first.", {
      concept: "no concept for this project yet",
    });
  }

  const { data: jobId, error: enqueueError } = await ctx.supabase.rpc("enqueue_job", {
    p_kind: "boq",
    p_project: id,
    p_payload: {},
  });
  if (enqueueError || !jobId) return serverError();

  return NextResponse.json({ job_id: jobId, status: "queued" }, { status: 202 });
}
