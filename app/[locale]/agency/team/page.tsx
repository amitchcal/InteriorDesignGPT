import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { TeamBoard, type OrgBoard } from "@/components/team-board";
import { createClient } from "@/lib/supabase/server";
import type { ProjectRow, TaskRow, TeamMember } from "@/types/delegation";

/**
 * Team & Delegation (owner board). Owner-only actions per the product decision —
 * we read the orgs the user OWNS. RLS still enforces every write server-side.
 */
export default async function TeamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("owner_id", user.id)
    .order("created_at");

  const boards: OrgBoard[] = [];
  for (const org of orgs ?? []) {
    const [{ data: members }, { data: projects }] = await Promise.all([
      supabase.rpc("org_team", { org: org.id }),
      supabase
        .from("projects")
        .select("id, name, status, assignee_id, due_date")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false }),
    ]);

    const projectRows = (projects ?? []) as ProjectRow[];
    const ids = projectRows.map((p) => p.id);
    const { data: tasks } = ids.length
      ? await supabase
          .from("project_tasks")
          .select("id, project_id, title, assignee_id, done, due_date")
          .in("project_id", ids)
          .order("created_at")
      : { data: [] as TaskRow[] };

    const byProject = new Map<string, TaskRow[]>();
    for (const t of (tasks ?? []) as TaskRow[]) {
      const list = byProject.get(t.project_id) ?? [];
      list.push(t);
      byProject.set(t.project_id, list);
    }

    boards.push({
      id: org.id,
      name: org.name,
      members: (members ?? []) as TeamMember[],
      projects: projectRows.map((p) => ({ ...p, tasks: byProject.get(p.id) ?? [] })),
    });
  }

  const t = await getTranslations("team");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm text-pretty">{t("subtitle")}</p>
      </div>

      {boards.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noOrgs")}</p>
      ) : (
        <TeamBoard boards={boards} currentUserId={user.id} />
      )}
    </main>
  );
}
