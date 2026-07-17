import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import { notFound, unauthorized } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ jobId: string }> };

/**
 * GET /api/jobs/:jobId — poll a queued engine job.
 *
 * RLS (jobs_read_own) means a user only sees their own jobs, so the jobId alone
 * is enough. The UI polls this; on 'done' it refreshes and the page re-reads the
 * persisted result (concept/BOQ/proposal) — the job's `result` is a summary, not
 * the artifact.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { jobId } = await params;

  const { data: job } = await ctx.supabase
    .from("jobs")
    .select("id, kind, status, result, error")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return notFound("that job");

  return NextResponse.json({
    status: job.status,
    kind: job.kind,
    ...(job.status === "done" && { result: job.result }),
    ...(job.status === "failed" && { error: job.error }),
  });
}
