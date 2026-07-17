import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { IntakeForm, type MarketOption } from "@/components/intake-form";
import { getMarketProfiles } from "@/lib/market";
import { createClient } from "@/lib/supabase/server";

export default async function NewProjectPage({
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

  const profiles = await getMarketProfiles();

  // Hand the form only what it renders from — the profile shape stays server-side.
  const markets: MarketOption[] = profiles.map(({ market_code, config }) => ({
    market_code,
    display_name: config.display_name,
    locale: config.locale,
    currency: config.currency,
    units: config.units,
    area_basis: config.area_basis,
    tax: config.tax,
    cultural_rules: config.cultural_rules,
    construction_modes: config.construction_modes,
    brand_tiers: config.brand_tiers,
  }));

  const t = await getTranslations("intake");

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          {t("subtitle")}
        </p>
      </div>

      <IntakeForm markets={markets} locale={locale} />
    </main>
  );
}
