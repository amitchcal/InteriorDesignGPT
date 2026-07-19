import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { AdminConsole } from "@/components/admin-console";
import { requirePlatformAdmin } from "@/lib/admin/guard";
import { listStudios } from "@/lib/admin/studios";

/**
 * Operator back-office. Guarded by requirePlatformAdmin — a non-admin (or a
 * signed-out visitor) gets a 404, so the console's existence isn't even
 * confirmed to them. Every action it triggers is re-checked server-side in the
 * /api/admin routes; this page guard is convenience + concealment, not the
 * security boundary.
 */
export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requirePlatformAdmin();
  if (!ctx) notFound();

  const t = await getTranslations("admin");
  const studios = await listStudios(ctx.admin);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm text-pretty">{t("subtitle")}</p>
      </div>
      <AdminConsole initialStudios={studios} />
    </main>
  );
}
