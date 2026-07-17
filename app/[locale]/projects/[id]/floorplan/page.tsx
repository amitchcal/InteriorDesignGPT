import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { FloorPlanWizard } from "@/components/floorplan-wizard";
import { getMarketProfile } from "@/lib/market";
import { createClient } from "@/lib/supabase/server";
import { intakeSchema } from "@/types/project";

export default async function FloorPlanPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, market_code, intake")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const profile = await getMarketProfile(project.market_code);
  const unit = profile.config.units === "metric" ? "m" : "ft";

  // The brief's ceiling height is the sensible per-room default — a plan rarely
  // annotates it, so the model returns null and this saves re-typing it.
  const intake = intakeSchema.safeParse(project.intake);
  const defaultCeiling = intake.success
    ? intake.data.client_brief.ceiling_height
    : null;

  const t = await getTranslations("floorplan");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          {t("subtitle", { project: project.name })}
        </p>
      </div>

      <FloorPlanWizard
        projectId={project.id}
        userId={user.id}
        locale={locale}
        unit={unit}
        defaultCeiling={defaultCeiling}
      />
    </main>
  );
}
