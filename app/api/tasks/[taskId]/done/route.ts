import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  forbidden,
  notFound,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { doneSchema } from "@/types/delegation";

type RouteContext = { params: Promise<{ taskId: string }> };

/**
 * POST /api/tasks/:taskId/done — toggle done. The one write a non-owner may
 * make: set_task_done (0018) allows the task's assignee (or the owner), and
 * touches only the `done` column.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { taskId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = doneSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { data, error } = await ctx.supabase.rpc("set_task_done", {
    p_task: taskId,
    p_done: parsed.data.done,
  });

  if (error) {
    if (error.code === "42501") return forbidden();
    if (error.code === "P0002") return notFound("that task");
    return serverError();
  }

  return NextResponse.json(data);
}
