import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { createDnaSchema } from "@/types/dna";

/**
 * GET /api/dna — the user's DNA profiles (for the picker + management).
 * RLS (dna_rw) restricts to their own.
 */
export async function GET() {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { data, error } = await ctx.supabase
    .from("designer_dna_profiles")
    .select("id, name, dna, source_count, created_at")
    .order("created_at", { ascending: false });
  if (error) return serverError();

  return NextResponse.json({ profiles: data });
}

/**
 * POST /api/dna — create a DNA profile from uploaded assets, then run the engine
 * on the worker (E2-5).
 *
 * api-contracts shows a synchronous 201 { dna_id, dna }, but the vision pass
 * over a whole back-catalogue can run as long as the other engines — so it goes
 * on the queue like them, and this returns 202 { dna_id, job_id }. The profile
 * row exists immediately; its `dna` fills when the job completes (poll
 * /api/jobs/:id). Deviation documented; same reason concept/boq/proposal are
 * async.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = createDnaSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  // Every asset path must be in the caller's own folder — the storage policy
  // authorizes on the leading segment (0004), and this gives a clear error
  // instead of a later storage denial in the worker.
  const stray = parsed.data.asset_paths.find(
    (p) => !p.startsWith(`${ctx.user.id}/`),
  );
  if (stray) {
    return apiError("validation_error", "Some uploads aren't yours.", {
      asset_paths: "must be your own uploads",
    });
  }

  // dna starts as an empty placeholder; the job fills it. source_count 0 marks
  // it not-yet-generated.
  const { data: profile, error: profileError } = await ctx.supabase
    .from("designer_dna_profiles")
    .insert({ owner_id: ctx.user.id, name: parsed.data.name, dna: {}, source_count: 0 })
    .select("id")
    .single();
  if (profileError || !profile) return serverError();

  const { error: assetsError } = await ctx.supabase.from("dna_training_assets").insert(
    parsed.data.asset_paths.map((path) => ({
      dna_id: profile.id,
      asset_url: path,
      kind: "image" as const,
    })),
  );
  if (assetsError) return serverError();

  const { data: jobId, error: enqueueError } = await ctx.supabase.rpc("enqueue_dna_job", {
    p_dna: profile.id,
  });
  if (enqueueError || !jobId) return serverError();

  return NextResponse.json(
    { dna_id: profile.id, job_id: jobId, status: "queued" },
    { status: 202 },
  );
}
