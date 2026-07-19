import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  forbidden,
  notFound,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { assignmentSchema } from "@/types/delegation";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/projects/:id/assignment — set/clear the assignee and due date.
 * Owner only: routed through the assign_project function (0018), which checks
 * can_manage_project itself so an org editor can't assign via the row policy.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = assignmentSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { data, error } = await ctx.supabase.rpc("assign_project", {
    p_project: id,
    p_assignee: parsed.data.assignee_id,
    p_due: parsed.data.due_date,
  });

  if (error) {
    if (error.code === "42501") return forbidden();
    if (error.code === "P0002") return notFound("that project");
    if (error.code === "23514") {
      return validationError(
        new z.ZodError([
          { code: "custom", path: ["assignee_id"], message: "not a member of this studio" },
        ]),
      );
    }
    return serverError();
  }

  return NextResponse.json(data);
}
