"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { planIds, type AdminStudio, type PlanId, type StudioStatus } from "@/types/admin";

export function AdminConsole({ initialStudios }: { initialStudios: AdminStudio[] }) {
  const t = useTranslations("admin");

  const [studios, setStudios] = useState<AdminStudio[]>(initialStudios);

  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [plan, setPlan] = useState<PlanId>("starter");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function createStudio() {
    if (!name.trim() || !ownerEmail.trim()) return;
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/admin/studios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), owner_email: ownerEmail.trim(), plan }),
    });
    setCreating(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setCreateError(body?.error?.message ?? t("createFailed"));
      return;
    }
    const created = (await res.json()) as AdminStudio;
    setStudios((s) => [created, ...s]);
    setName("");
    setOwnerEmail("");
    setPlan("starter");
  }

  async function patchStudio(
    id: string,
    patch: { plan?: PlanId; status?: StudioStatus },
  ) {
    setBusyId(id);
    const res = await fetch(`/api/admin/studios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusyId(null);
    if (res.ok) {
      const updated = (await res.json()) as Partial<AdminStudio> & { id: string };
      setStudios((s) => s.map((x) => (x.id === id ? { ...x, ...updated } : x)));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 rounded-xl border p-5">
        <h2 className="font-medium">{t("createTitle")}</h2>
        <p className="text-muted-foreground text-xs text-pretty">{t("createHint")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t("nameLabel")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-input bg-background rounded-md border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t("ownerEmailLabel")}</span>
            <input
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              type="email"
              placeholder="owner@studio.com"
              className="border-input bg-background rounded-md border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t("planLabel")}</span>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as PlanId)}
              className="border-input bg-background rounded-md border px-3 py-2"
            >
              {planIds.map((p) => (
                <option key={p} value={p}>
                  {t(`plan_${p}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {createError && (
          <p role="alert" className="text-destructive text-sm">
            {createError}
          </p>
        )}
        <Button
          className="self-start"
          disabled={creating || !name.trim() || !ownerEmail.trim()}
          onClick={createStudio}
        >
          {creating ? t("creating") : t("createCta")}
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{t("studiosTitle")}</h2>
        {studios.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noStudios")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground border-b text-xs">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t("colName")}</th>
                  <th className="py-2 pr-3 font-medium">{t("colOwner")}</th>
                  <th className="py-2 pr-3 font-medium">{t("colPlan")}</th>
                  <th className="py-2 pr-3 font-medium">{t("colMembers")}</th>
                  <th className="py-2 pr-3 font-medium">{t("colStatus")}</th>
                  <th className="py-2 font-medium">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {studios.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-3">{s.name}</td>
                    <td className="text-muted-foreground py-2 pr-3">
                      {s.owner_email ?? s.owner_id}
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={s.plan}
                        disabled={busyId === s.id}
                        onChange={(e) =>
                          patchStudio(s.id, { plan: e.target.value as PlanId })
                        }
                        className="border-input bg-background rounded-md border px-2 py-1 text-xs"
                      >
                        {planIds.map((p) => (
                          <option key={p} value={p}>
                            {t(`plan_${p}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">{s.member_count}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          s.status === "active"
                            ? "text-xs text-emerald-700 dark:text-emerald-500"
                            : "text-destructive text-xs"
                        }
                      >
                        {t(`status_${s.status}`)}
                      </span>
                    </td>
                    <td className="py-2">
                      <button
                        className="underline underline-offset-4"
                        disabled={busyId === s.id}
                        onClick={() =>
                          patchStudio(s.id, {
                            status: s.status === "active" ? "suspended" : "active",
                          })
                        }
                      >
                        {s.status === "active" ? t("suspend") : t("activate")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
