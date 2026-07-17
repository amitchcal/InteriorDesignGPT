import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import { notFound, serverError, unauthorized } from "@/lib/api/errors";
import { getRenderProvider, RenderProviderError } from "@/lib/providers/render";

type RouteContext = { params: Promise<{ jobId: string }> };

/**
 * GET /api/render/:jobId — poll a render job (E4-2).
 *
 * Contract: { status: "done", output_url: "https://..." }.
 *
 * Polls the provider only while the job is still running, then persists the
 * result so subsequent polls (and the page) read the row, not the vendor. RLS
 * on render_jobs (via owns_project) means a user can only see their own jobs —
 * the jobId is enough, no project id in the path.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { jobId } = await params;

  const { data: job } = await ctx.supabase
    .from("render_jobs")
    .select("id, status, output_url, input")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return notFound("that render job");

  // Terminal states are read straight from the row — no vendor call needed.
  if (job.status === "done") {
    return NextResponse.json({ status: "done", output_url: job.output_url });
  }
  if (job.status === "failed") {
    return NextResponse.json({ status: "failed" });
  }

  const externalId = (job.input as { external_id?: string } | null)?.external_id;
  if (!externalId) {
    // Dispatched row with no vendor id — dispatch never completed. Treat as
    // failed rather than polling forever.
    await ctx.supabase.from("render_jobs").update({ status: "failed" }).eq("id", job.id);
    return NextResponse.json({ status: "failed" });
  }

  let provider;
  try {
    provider = getRenderProvider();
  } catch {
    return serverError();
  }

  let poll;
  try {
    poll = await provider.poll(externalId);
  } catch (error) {
    if (error instanceof RenderProviderError) {
      // A transient poll failure is not terminal — report running and let the
      // client poll again rather than marking the job failed on one blip.
      return NextResponse.json({ status: job.status });
    }
    return serverError();
  }

  if (poll.status === "done" && poll.image_url) {
    await ctx.supabase
      .from("render_jobs")
      .update({ status: "done", output_url: poll.image_url })
      .eq("id", job.id);
    return NextResponse.json({ status: "done", output_url: poll.image_url });
  }

  if (poll.status === "failed") {
    await ctx.supabase.from("render_jobs").update({ status: "failed" }).eq("id", job.id);
    return NextResponse.json({ status: "failed" });
  }

  // Still queued or running — reflect the vendor's state without persisting a
  // transient status change.
  return NextResponse.json({ status: poll.status });
}
