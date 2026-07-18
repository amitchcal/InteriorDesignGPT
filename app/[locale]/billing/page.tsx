import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { Pricing, type CurrentSub } from "@/components/pricing";
import { getMarketProfile } from "@/lib/market";
import { createClient } from "@/lib/supabase/server";

export default async function BillingPage({
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

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("default_market_code")
    .eq("user_id", user.id)
    .maybeSingle();
  const marketCode = profileRow?.default_market_code ?? "IN";
  const market = await getMarketProfile(marketCode);

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan, quota_projects, used_projects")
    .eq("owner_id", user.id)
    .maybeSingle();

  const t = await getTranslations("billing");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          {t("subtitle", { market: market.config.display_name })}
        </p>
      </div>

      <Pricing
        marketCode={marketCode}
        currencyCode={market.config.currency.code}
        locale={market.config.locale}
        current={
          sub
            ? ({
                plan: sub.plan,
                quota: sub.quota_projects,
                used: sub.used_projects,
              } satisfies CurrentSub)
            : null
        }
      />
    </main>
  );
}
