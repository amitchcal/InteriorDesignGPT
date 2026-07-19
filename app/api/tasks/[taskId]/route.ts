import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  notFound,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { updateTaskSchema } from "@/types/delegation";

type RouteContext = { params: Promise<{ taskId: string }> };

const TASK_COLS = "id, project_id, title, assignee_id, done, due_date";

/**
 * PATCH /api/tasks/:taskId — edit a task's title/assignee/due date. Owner only:
 * tasks_write (0018) gates the UPDATE, so a non-owner's write matches no row and
 * comes back as not_found (which also avoids confirming the task exists).
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { taskId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { data, error } = await ctx.supabase
    .from("project_tasks")
    .update(parsed.data)
    .eq("id", taskId)
    .select(TASK_COLS)
    .maybeSingle();

  if (error) return serverError();
  if (!data) return notFound("that task");

  return NextResponse.json(data);
}

/** DELETE /api/tasks/:taskId — remove a task. Owner only (RLS). */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { taskId } = await params;

  const { data, error } = await ctx.supabase
    .from("project_tasks")
    .delete()
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error) return serverError();
  if (!data) return notFound("that task");

  return NextResponse.json({ ok: true });
}
