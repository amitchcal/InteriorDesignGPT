import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { BrandingPanel, type OrgBranding } from "@/components/branding-panel";
import { createClient } from "@/lib/supabase/server";
import type { OrgDomain } from "@/types/branding";

/**
 * White-label settings (E-white-label). Owner-only: branding + custom domains
 * per org. Orgs are read with an owner_id filter — only an owner brands an org
 * (RLS org_write enforces the writes anyway).
 */
export default async function BrandingSettingsPage({
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
    .select("id, name, brand_name, logo_path, primary_color, accent_color")
    .eq("owner_id", user.id)
    .order("created_at");

  const { data: domains } = await supabase
    .from("org_domains")
    .select("id, org_id, hostname, status, verification, created_at")
    .order("created_at", { ascending: false });

  const t = await getTranslations("branding");
  const orgList = (orgs ?? []) as OrgBranding[];
  const byOrg = (domains ?? []) as OrgDomain[];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm text-pretty">{t("subtitle")}</p>
      </div>

      {orgList.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noOrgs")}</p>
      ) : (
        orgList.map((org) => (
          <BrandingPanel
            key={org.id}
            org={org}
            initialDomains={byOrg.filter((d) => d.org_id === org.id)}
          />
        ))
      )}
    </main>
  );
}
