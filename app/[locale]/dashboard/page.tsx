import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage({
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

  // Reads through RLS as this user — the profile row was created by the
  // on_auth_user_created trigger (0007).
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, default_market_code")
    .eq("user_id", user.id)
    .maybeSingle();

  const t = await getTranslations("dashboard");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("signedInAs", { email: user.email ?? "" })}
          </p>
        </div>
        <SignOutButton locale={locale} />
      </div>

      <dl className="grid gap-2 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{t("profileName")}:</dt>
          <dd>{profile?.full_name ?? t("noName")}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{t("defaultMarket")}:</dt>
          <dd>{profile?.default_market_code ?? "—"}</dd>
        </div>
      </dl>

      <p className="text-muted-foreground text-sm text-pretty">
        {t("placeholder")}
      </p>
    </main>
  );
}
