import { getTranslations, setRequestLocale } from "next-intl/server";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const tApp = await getTranslations("app");
  const tAdvisory = await getTranslations("advisory");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium tracking-tight">
          {tApp("name")}
        </span>
        <LocaleSwitcher />
      </header>

      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-pretty">{t("subtitle")}</p>
      </div>

      <dl className="grid gap-2 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{t("marketLabel")}:</dt>
          <dd>{t("marketName")}</dd>
        </div>
        <div className="text-muted-foreground">{t("currencyNote")}</div>
        <div className="text-muted-foreground">{t("unitsNote")}</div>
      </dl>

      <div>
        <Button>{t("cta")}</Button>
      </div>

      <p className="text-muted-foreground mt-auto text-xs text-pretty">
        {tAdvisory("disclaimer")}
      </p>
    </main>
  );
}
