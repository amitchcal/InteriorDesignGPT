import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { DnaManager, type DnaProfile } from "@/components/dna-manager";
import { createClient } from "@/lib/supabase/server";

export default async function DnaPage({
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

  const { data: profiles } = await supabase
    .from("designer_dna_profiles")
    .select("id, name, dna, source_count")
    .order("created_at", { ascending: false });

  const t = await getTranslations("dna");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm text-pretty">{t("subtitle")}</p>
      </div>

      <DnaManager
        userId={user.id}
        initialProfiles={(profiles ?? []) as DnaProfile[]}
      />
    </main>
  );
}
