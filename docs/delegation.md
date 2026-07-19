# Team & delegation

A studio-workspace page at **`/agency/team`** where a studio **owner** assigns
projects to designers, sets due dates, and breaks projects into delegatable
tasks. The agency page only *shows* projects; this is where work is handed out.

## Permission model (owner-only delegation)

Decided: only the studio **owner** delegates.

| Action | Who |
|---|---|
| Assign / reassign a project, set its due date | Owner (`assign_project`) |
| Create / edit / delete a task | Owner (`project_tasks` RLS `tasks_write`) |
| Mark a task done | The task's **assignee**, or the owner (`set_task_done`) |
| See the board (projects + tasks) | Any member of the studio (`can_see_project`) |

Two writes are **column-restricted** and so go through security-definer
functions rather than row policies (RLS can't gate individual columns):

- **`assign_project(project, assignee, due)`** — `projects_write` (0015) lets any
  org *editor* update a project, so assignment is routed through this function,
  which checks `can_manage_project` (owner) itself and validates the assignee is
  a member of the studio.
- **`set_task_done(task, done)`** — lets the assignee flip only `done`, without
  being able to touch the task's title/assignee.

`org_team(org)` is a definer function (guarded by `is_org_member`) that returns
the member roster with names/emails, so the owner can populate the assignee
dropdown — member identities aren't otherwise readable across the team.

## Data model (0018)

- `projects.assignee_id`, `projects.due_date`.
- `project_tasks` (project_id, title, assignee_id, done, due_date) + RLS.

## API

- `PATCH /api/projects/:id/assignment` — `{ assignee_id, due_date }`.
- `GET | POST /api/projects/:id/tasks`.
- `PATCH | DELETE /api/tasks/:taskId` (owner edits).
- `POST /api/tasks/:taskId/done` — `{ done }` (assignee or owner).

## Tests

- Unit (`test/unit/delegation.test.ts`): assignment/task/done schema validation,
  `memberLabel` fallback.
- Integration (`test/integration/delegation.test.ts`): `can_manage_project` is
  owner-only; `assign_project` rejects non-owners and non-member assignees;
  `project_tasks` write is owner-only while any member reads; `set_task_done`
  allows the assignee but not a bystander; `org_team` is member-scoped.

## Follow-ups (not in v1)

- A designer's **"assigned to me"** view (the board is currently the owner's).
- Notifications on assignment; comments/activity; calendar/Gantt.
