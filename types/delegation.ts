import { z } from "zod";

/** Delegation (Team page) request shapes and view types. */

/** YYYY-MM-DD, or null to clear. */
const dateOrNull = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")
  .nullable();

const assigneeOrNull = z.string().uuid("must be a user id").nullable();

/** PATCH /api/projects/:id/assignment — set/clear assignee and due date. */
export const assignmentSchema = z.object({
  assignee_id: assigneeOrNull,
  due_date: dateOrNull,
});

/** POST /api/projects/:id/tasks */
export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "required").max(200),
  assignee_id: assigneeOrNull.optional(),
  due_date: dateOrNull.optional(),
});

/** PATCH /api/tasks/:taskId — owner edits (not the done toggle). */
export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    assignee_id: assigneeOrNull.optional(),
    due_date: dateOrNull.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "nothing to update" });

/** POST /api/tasks/:taskId/done — assignee (or owner) toggles done. */
export const doneSchema = z.object({ done: z.boolean() });

export type TeamMember = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: "owner" | "designer" | "viewer";
};

/** A member's shown label: name, else email, else a short id. */
export function memberLabel(m: TeamMember): string {
  return m.display_name || m.email || `${m.user_id.slice(0, 8)}…`;
}

export type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  assignee_id: string | null;
  done: boolean;
  due_date: string | null;
};

export type ProjectRow = {
  id: string;
  name: string;
  status: string;
  assignee_id: string | null;
  due_date: string | null;
};
