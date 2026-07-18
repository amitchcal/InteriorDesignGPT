import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Agency hub (E5-5) — an org owner sees every member's projects, read through
 * RLS. Nothing here special-cases ownership: projects_read (0015) returns the
 * org's projects to any member, so a plain select is the hub.
 */
export default async function AgencyPage({
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

  // Orgs the user owns (the hub is the owner's view of their agency).
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("owner_id", user.id)
    .order("created_at");

  const t = await getTranslations("agency");

  const orgList = orgs ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm text-pretty">{t("subtitle")}</p>
      </div>

      {orgList.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noOrgs")}</p>
      ) : (
        orgList.map((org) => <OrgBlock key={org.id} orgId={org.id} name={org.name} locale={locale} />)
      )}
    </main>
  );
}

async function OrgBlock({
  orgId,
  name,
  locale,
}: {
  orgId: string;
  name: string;
  locale: string;
}) {
  const supabase = await createClient();
  const t = await getTranslations("agency");

  // RLS returns the org's projects to the owner (a member) — no owner_id filter.
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status, owner_id, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", orgId);

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">{name}</h2>
        <span className="text-muted-foreground text-xs">
          {t("memberCount", { count: String(members?.length ?? 0) })}
        </span>
      </div>

      {projects && projects.length > 0 ? (
        <ul className="flex flex-col divide-y text-sm">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <Link
                href={`/${locale}/projects/${p.id}`}
                className="underline underline-offset-4"
              >
                {p.name}
              </Link>
              <span className="text-muted-foreground text-xs">{p.status}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("noProjects")}</p>
      )}
    </section>
  );
}
