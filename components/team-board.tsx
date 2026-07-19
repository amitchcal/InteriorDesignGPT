"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  memberLabel,
  type ProjectRow,
  type TaskRow,
  type TeamMember,
} from "@/types/delegation";

export type ProjectBoard = ProjectRow & { tasks: TaskRow[] };
export type OrgBoard = {
  id: string;
  name: string;
  members: TeamMember[];
  projects: ProjectBoard[];
};

export function TeamBoard({
  boards,
  currentUserId,
}: {
  boards: OrgBoard[];
  currentUserId: string;
}) {
  const t = useTranslations("team");
  const [state, setState] = useState<OrgBoard[]>(boards);

  function updateProject(projectId: string, fn: (p: ProjectBoard) => ProjectBoard) {
    setState((orgs) =>
      orgs.map((o) => ({
        ...o,
        projects: o.projects.map((p) => (p.id === projectId ? fn(p) : p)),
      })),
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {state.map((org) => (
        <section key={org.id} className="flex flex-col gap-3">
          <h2 className="font-medium">{org.name}</h2>
          {org.projects.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noProjects")}</p>
          ) : (
            <div className="flex flex-col divide-y rounded-xl border">
              {org.projects.map((p) => (
                <ProjectItem
                  key={p.id}
                  project={p}
                  members={org.members}
                  currentUserId={currentUserId}
                  onChange={(fn) => updateProject(p.id, fn)}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function ProjectItem({
  project,
  members,
  currentUserId,
  onChange,
}: {
  project: ProjectBoard;
  members: TeamMember[];
  currentUserId: string;
  onChange: (fn: (p: ProjectBoard) => ProjectBoard) => void;
}) {
  const t = useTranslations("team");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const labelFor = (id: string | null) =>
    id ? (members.find((m) => m.user_id === id) ? memberLabel(members.find((m) => m.user_id === id)!) : t("unknown")) : t("unassigned");

  async function assign(assignee_id: string | null, due_date: string | null) {
    setBusy(true);
    const res = await fetch(`/api/projects/${project.id}/assignment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee_id, due_date }),
    });
    setBusy(false);
    if (res.ok) onChange((p) => ({ ...p, assignee_id, due_date }));
  }

  async function addTask() {
    if (!title.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${project.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      const task = (await res.json()) as TaskRow;
      onChange((p) => ({ ...p, tasks: [...p.tasks, task] }));
      setTitle("");
    }
  }

  async function toggleDone(task: TaskRow) {
    const done = !task.done;
    const res = await fetch(`/api/tasks/${task.id}/done`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    if (res.ok)
      onChange((p) => ({
        ...p,
        tasks: p.tasks.map((x) => (x.id === task.id ? { ...x, done } : x)),
      }));
  }

  async function removeTask(task: TaskRow) {
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (res.ok)
      onChange((p) => ({ ...p, tasks: p.tasks.filter((x) => x.id !== task.id) }));
  }

  const doneCount = project.tasks.filter((x) => x.done).length;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="flex items-center gap-2 text-left font-medium"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="text-muted-foreground text-xs">{open ? "▾" : "▸"}</span>
          {project.name}
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
            {project.status}
          </span>
          {project.tasks.length > 0 && (
            <span className="text-muted-foreground text-xs">
              {t("taskProgress", { done: String(doneCount), total: String(project.tasks.length) })}
            </span>
          )}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t("assignee")}
            value={project.assignee_id ?? ""}
            disabled={busy}
            onChange={(e) => assign(e.target.value || null, project.due_date)}
            className="border-input bg-background rounded-md border px-2 py-1 text-sm"
          >
            <option value="">{t("unassigned")}</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {memberLabel(m)}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label={t("dueDate")}
            value={project.due_date ?? ""}
            disabled={busy}
            onChange={(e) => assign(project.assignee_id, e.target.value || null)}
            className="border-input bg-background rounded-md border px-2 py-1 text-sm"
          />
        </div>
      </div>

      {open && (
        <div className="border-border ml-4 flex flex-col gap-2 border-l pl-4">
          {project.tasks.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t("noTasks")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {project.tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() => toggleDone(task)}
                    aria-label={t("markDone")}
                  />
                  <span className={task.done ? "text-muted-foreground line-through" : ""}>
                    {task.title}
                  </span>
                  {task.assignee_id && (
                    <span className="text-muted-foreground text-xs">
                      · {labelFor(task.assignee_id)}
                      {task.assignee_id === currentUserId ? ` (${t("you")})` : ""}
                    </span>
                  )}
                  <button
                    className="text-muted-foreground hover:text-destructive ml-auto text-xs"
                    onClick={() => removeTask(task)}
                    aria-label={t("removeTask")}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("taskPlaceholder")}
              className="border-input bg-background flex-1 rounded-md border px-2 py-1 text-sm"
            />
            <Button variant="outline" disabled={busy || !title.trim()} onClick={addTask}>
              {t("addTask")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
