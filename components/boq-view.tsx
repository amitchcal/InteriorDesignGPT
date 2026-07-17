"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Currency } from "@/types/market";
import type { ValueEngineeringOption } from "@/types/boq";

export type BoqLine = {
  id: string;
  room: string;
  item_code: string | null;
  spec: string;
  qty: number;
  unit: string;
  rate_minor: number;
  amount_minor: number;
  tier: string;
};

export type BoqSummaryView = {
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  currency: string;
  budget_delta_minor: number | null;
  value_engineering: ValueEngineeringOption[];
};

export function BoqView({
  projectId,
  initialItems,
  initialSummary,
  currency,
  locale,
  taxName,
  canGenerate,
}: {
  projectId: string;
  initialItems: BoqLine[];
  initialSummary: BoqSummaryView | null;
  currency: Currency;
  locale: string;
  taxName: string;
  canGenerate: boolean;
}) {
  const t = useTranslations("boq");
  const router = useRouter();

  const [items, setItems] = useState(initialItems);
  const [summary, setSummary] = useState(initialSummary);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Formatting from the market's own currency + locale, same as the server.
  const fmt = (minor: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: currency.code }).format(
      minor / 100,
    );

  async function generate() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/boq`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const p = await res.json().catch(() => null);
      setError(p?.error?.message ?? t("failed"));
      return;
    }
    router.refresh();
  }

  /** E3-5: edit a line's rate; the server re-totals and returns the summary. */
  async function saveRate(id: string) {
    const rate = Number(draft);
    if (!Number.isFinite(rate) || rate < 0) return;

    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/boq/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rate }),
    });
    setBusy(false);
    setEditing(null);

    if (!res.ok) {
      setError(t("editFailed"));
      return;
    }

    const body = await res.json();
    // Trust the server's arithmetic, not a local recompute — there is one place
    // that owns these numbers.
    setSummary((prev) => (prev ? { ...prev, ...body.summary } : prev));
    const rate_minor = Math.round(rate * 100);
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, rate_minor, amount_minor: Math.round(i.qty * rate_minor) }
          : i,
      ),
    );
    router.refresh();
  }

  if (!summary) {
    return (
      <div className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button disabled={!canGenerate || busy} onClick={generate} className="self-start">
          {busy ? t("generating") : t("generateCta")}
        </Button>
        {!canGenerate && <p className="text-muted-foreground text-xs">{t("conceptFirst")}</p>}
      </div>
    );
  }

  const over = (summary.budget_delta_minor ?? 0) > 0;
  const rooms = [...new Set(items.map((i) => i.room))];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("title", { count: String(items.length) })}
        </h2>
        <div className="flex gap-2">
          <a
            href={`/api/projects/${projectId}/export/boq.xlsx`}
            className="border-input rounded-md border px-3 py-1.5 text-sm"
          >
            {t("exportXlsx")}
          </a>
          <Button size="sm" variant="outline" disabled={busy} onClick={generate}>
            {busy ? t("generating") : t("regenerate")}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="py-1 pr-2 font-medium">{t("spec")}</th>
              <th className="py-1 pr-2 text-right font-medium">{t("qty")}</th>
              <th className="py-1 pr-2 text-right font-medium">{t("rate")}</th>
              <th className="py-1 text-right font-medium">{t("amount")}</th>
            </tr>
          </thead>
          {rooms.map((room) => (
            <tbody key={room}>
              <tr>
                <td colSpan={4} className="text-muted-foreground pt-3 pb-1 text-xs font-medium">
                  {room}
                </td>
              </tr>
              {items
                .filter((i) => i.room === room)
                .map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">
                      <span className="block text-pretty">{item.spec}</span>
                      {item.item_code && (
                        <span className="text-muted-foreground text-xs">
                          {item.item_code}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                      {item.qty} {item.unit}
                    </td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                      {editing === item.id ? (
                        <input
                          autoFocus
                          type="number"
                          step="any"
                          min="0"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => saveRate(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRate(item.id);
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="border-input w-24 rounded border px-1 py-0.5 text-right"
                          data-testid={`rate-input-${item.id}`}
                        />
                      ) : (
                        <button
                          type="button"
                          className="underline decoration-dotted underline-offset-4"
                          data-testid={`rate-${item.id}`}
                          onClick={() => {
                            setEditing(item.id);
                            setDraft(String(item.rate_minor / 100));
                          }}
                        >
                          {fmt(item.rate_minor)}
                        </button>
                      )}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {fmt(item.amount_minor)}
                    </td>
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>

      <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
        <Total label={t("subtotal")} value={fmt(summary.subtotal_minor)} />
        <Total label={taxName} value={fmt(summary.tax_minor)} />
        <Total label={t("total")} value={fmt(summary.total_minor)} bold />
        {summary.budget_delta_minor !== null && (
          <Total
            label={over ? t("overBudget") : t("underBudget")}
            value={fmt(Math.abs(summary.budget_delta_minor))}
            tone={over ? "text-destructive" : "text-emerald-700 dark:text-emerald-500"}
          />
        )}
      </dl>

      {/* E3-3: ranked options, only when over budget. */}
      {summary.value_engineering.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/50 p-3">
          <p className="text-sm font-medium">{t("valueEngineering")}</p>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            {summary.value_engineering.map((o, i) => (
              <li key={i} data-testid={`ve-${i}`}>
                <span className="font-medium">{o.label}</span>{" "}
                <span className="text-emerald-700 dark:text-emerald-500">
                  {fmt(o.delta_minor)}
                </span>
                <span className="text-muted-foreground block text-xs text-pretty">
                  {o.note}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Non-negotiable #3. */}
      <p className="text-muted-foreground text-xs text-pretty">{t("disclaimer")}</p>
    </section>
  );
}

function Total({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: string;
}) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? "font-semibold" : ""} ${tone ?? ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
