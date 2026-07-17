import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import { apiError, notFound, serverError, unauthorized } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id/proposal — a fresh signed URL for the latest proposal.
 *
 * The PDF lives in the private `proposals` bucket; signed URLs expire, so we
 * mint one on demand rather than storing it. Returns 404 until the job has
 * produced a proposal.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  const { data: proposal } = await ctx.supabase
    .from("proposals")
    .select("version, pdf_url")
    .eq("project_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!proposal) return notFound("a proposal for this project");

  const { data: signed, error } = await ctx.supabase.storage
    .from("proposals")
    .createSignedUrl(proposal.pdf_url, 60 * 60);
  if (error || !signed) return serverError();

  return NextResponse.json({ version: proposal.version, pdf_url: signed.signedUrl });
}

/**
 * POST /api/projects/:id/proposal — enqueue the proposal PDF (E4-1).
 *
 * Contract: 202 { job_id, status:"queued" }; poll GET /api/jobs/:id. The engine
 * copy + PDF render take ~105s, so the work runs on the worker (docs/infra.md).
 * The route checks a BOQ exists and enqueues.
 *
 * The finished proposal is at proposals.pdf_url (a storage path); the page mints
 * a fresh signed URL when it loads, so nothing here returns one.
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

  const { data: summary } = await ctx.supabase
    .from("boq_summaries")
    .select("id")
    .eq("project_id", id)
    .limit(1)
    .maybeSingle();
  if (!summary) {
    return apiError("validation_error", "Generate a concept and a BOQ first.", {
      boq: "missing",
    });
  }

  const { data: jobId, error: enqueueError } = await ctx.supabase.rpc("enqueue_job", {
    p_kind: "proposal",
    p_project: id,
    p_payload: {},
  });
  if (enqueueError || !jobId) return serverError();

  return NextResponse.json({ job_id: jobId, status: "queued" }, { status: 202 });
}
