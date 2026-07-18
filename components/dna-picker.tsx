"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type DnaOption = { id: string; name: string; source_count: number };

/**
 * Attaches a Designer-DNA profile to a project (E2-5). The concept picks it up
 * on its next run. Only shows when the user has at least one profile.
 */
export function DnaPicker({
  projectId,
  options,
  currentDnaId,
}: {
  projectId: string;
  options: DnaOption[];
  currentDnaId: string | null;
}) {
  const t = useTranslations("dna");
  const router = useRouter();
  const [value, setValue] = useState(currentDnaId ?? "");
  const [busy, setBusy] = useState(false);

  if (options.length === 0) return null;

  async function apply(next: string) {
    setValue(next);
    setBusy(true);
    await fetch(`/api/projects/${projectId}/dna`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dna_id: next || null }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t("applyLabel")}</span>
      <select
        value={value}
        disabled={busy}
        onChange={(e) => apply(e.target.value)}
        className="border-input bg-background rounded-md border px-2 py-1"
        data-testid="dna-picker"
      >
        <option value="">{t("noneOption")}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
