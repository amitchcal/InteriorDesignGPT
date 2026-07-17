import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { ConceptView } from "@/components/concept-view";
import { ValidationGate } from "@/components/validation-gate";
import { getMarketProfile } from "@/lib/market";
import { formatMoney } from "@/lib/market/money";
import { createClient } from "@/lib/supabase/server";
import { conceptSchema } from "@/types/concept";
import { intakeSchema } from "@/types/project";

export default async function ProjectPage({
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

  // RLS: another user's project simply isn't here.
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, market_code, status, intake, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  const profile = await getMarketProfile(project.market_code);
  const parsed = intakeSchema.safeParse(project.intake);

  const { data: latestConcept } = await supabase
    .from("design_concepts")
    .select("version, concept")
    .eq("project_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const conceptParsed = latestConcept
    ? conceptSchema.safeParse(latestConcept.concept)
    : null;

  const t = await getTranslations("project");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="text-muted-foreground text-sm">
          {t("meta", {
            market: profile.config.display_name,
            status: project.status,
          })}
        </p>
      </div>

      {parsed.success ? (
        <dl className="grid gap-2 text-sm">
          <Row
            label={t("budget")}
            value={formatMoney(
              parsed.data.client_brief.budget_total_minor,
              profile.config.currency,
              profile.config.locale,
            )}
          />
          <Row
            label={t("ceiling")}
            value={`${parsed.data.client_brief.ceiling_height} ${parsed.data.client_brief.ceiling_height_unit}`}
          />
          <Row label={t("tier")} value={parsed.data.preferences.tier} />
          <Row
            label={t("cultural")}
            value={
              Object.entries(parsed.data.cultural_overrides)
                .filter(([, on]) => on)
                .map(([rule]) => rule)
                .join(", ") || t("none")
            }
          />
        </dl>
      ) : (
        <p className="text-destructive text-sm">{t("intakeUnreadable")}</p>
      )}

      <ValidationGate
        projectId={project.id}
        rules={profile.config.cultural_rules}
      />

      <ConceptView
        projectId={project.id}
        initialConcept={conceptParsed?.success ? conceptParsed.data : null}
        initialVersion={latestConcept?.version ?? null}
        canGenerate={project.status !== "draft"}
      />

      <p className="text-muted-foreground mt-auto text-xs text-pretty">
        {t("nextStep")}
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd>{value}</dd>
    </div>
  );
}
