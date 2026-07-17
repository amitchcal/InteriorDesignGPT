import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  notFound,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { EngineError, EngineOutputError } from "@/lib/engines/client";
import {
  MAX_PLAN_BYTES,
  isAcceptedPlanType,
  parseFloorPlan,
} from "@/lib/engines/floorplan";
import { parseResultSchema } from "@/types/floorplan";

const bodySchema = z.object({
  /** Storage path in the private `floor-plans` bucket: <uid>/<project_id>/<file> */
  source_path: z.string().min(1, "required"),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/floorplan/parse
 *
 * api-contracts names `source_url`, but the bucket is private (0004) so a URL
 * would either be unusable or force us to mint a public one. We take the
 * storage path instead and read it server-side through the caller's session, so
 * storage RLS still applies — a user cannot parse someone else's upload by
 * guessing a path.
 *
 * Parse is best-effort: every failure returns 502 provider_error and the UI
 * falls back to manual entry. It must never block (Task 5).
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id: projectId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  // RLS: someone else's project simply isn't visible.
  const { data: project } = await ctx.supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return notFound("that project");

  // The storage policy checks the leading path segment against auth.uid(), but
  // check here too: it gives a clear error instead of an opaque storage denial.
  if (!parsed.data.source_path.startsWith(`${ctx.user.id}/`)) {
    return notFound("that file");
  }

  const { data: file, error: downloadError } = await ctx.supabase.storage
    .from("floor-plans")
    .download(parsed.data.source_path);

  if (downloadError || !file) return notFound("that file");

  if (file.size > MAX_PLAN_BYTES) {
    return apiError("validation_error", "That file is too large to read.", {
      source_path: `must be under ${Math.floor(MAX_PLAN_BYTES / 1024 / 1024)}MB`,
    });
  }

  const mediaType = file.type;
  if (!isAcceptedPlanType(mediaType)) {
    return apiError("validation_error", "That file type can't be read.", {
      source_path: "must be a PDF, JPEG, PNG, GIF or WebP",
    });
  }

  // Record the upload before parsing, so a failed parse still leaves a row the
  // user can confirm rooms against manually.
  const { data: floorPlan, error: insertError } = await ctx.supabase
    .from("floor_plans")
    .insert({
      project_id: projectId,
      source_url: parsed.data.source_path,
      confirmed: false,
    })
    .select("id")
    .single();

  if (insertError || !floorPlan) return serverError();

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  try {
    const result = await parseFloorPlan({ base64, mediaType });

    const { error: updateError } = await ctx.supabase
      .from("floor_plans")
      .update({ parsed: result })
      .eq("id", floorPlan.id);

    if (updateError) return serverError();

    return NextResponse.json({
      floor_plan_id: floorPlan.id,
      parsed: parseResultSchema.parse(result),
      confirmed: false,
    });
  } catch (error) {
    if (error instanceof EngineError || error instanceof EngineOutputError) {
      // 502 with the floor_plan_id so the UI can still confirm rooms manually
      // against this upload rather than starting over.
      return NextResponse.json(
        {
          error: {
            code: "provider_error",
            message: "We couldn't read that plan. You can enter the rooms yourself.",
          },
          floor_plan_id: floorPlan.id,
        },
        { status: 502 },
      );
    }
    return serverError();
  }
}
