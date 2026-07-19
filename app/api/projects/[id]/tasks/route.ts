import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { createTaskSchema } from "@/types/delegation";

type RouteContext = { params: Promise<{ id: string }> };

const TASK_COLS = "id, project_id, title, assignee_id, done, due_date";

/** GET /api/projects/:id/tasks — tasks for a project. Members read (RLS). */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  const { data, error } = await ctx.supabase
    .from("project_tasks")
    .select(TASK_COLS)
    .eq("project_id", id)
    .order("created_at");

  if (error) return serverError();

  return NextResponse.json({ tasks: data });
}

/** POST /api/projects/:id/tasks — create a task. Owner only (RLS tasks_write). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { data, error } = await ctx.supabase
    .from("project_tasks")
    .insert({
      project_id: id,
      title: parsed.data.title,
      assignee_id: parsed.data.assignee_id ?? null,
      due_date: parsed.data.due_date ?? null,
    })
    .select(TASK_COLS)
    .single();

  if (error) {
    // RLS rejected (not the owner) or the project doesn't exist.
    if (error.code === "42501" || error.code === "PGRST116") return forbidden();
    return serverError();
  }

  return NextResponse.json(data, { status: 201 });
}
