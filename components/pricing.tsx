"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PLANS, type PlanId } from "@/lib/billing/plans";

export type CurrentSub = { plan: string; quota: number; used: number };

export function Pricing({
  marketCode,
  currencyCode,
  locale,
  current,
}: {
  marketCode: string;
  currencyCode: string;
  locale: string;
  current: CurrentSub | null;
}) {
  const t = useTranslations("billing");
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const money = (minor: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(minor / 100);

  async function upgrade(plan: PlanId) {
    setBusy(plan);
    setError(null);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, market_code: marketCode }),
    });
    setBusy(null);
    if (!res.ok) {
      const p = await res.json().catch(() => null);
      setError(p?.error?.message ?? t("failed"));
      return;
    }
    const { checkout_url } = await res.json();
    window.location.assign(checkout_url); // hosted checkout
  }

  return (
    <div className="flex flex-col gap-4">
      {current && (
        <p className="text-muted-foreground text-sm">
          {t("current", {
            plan: current.plan,
            used: String(current.used),
            quota: String(current.quota),
          })}
        </p>
      )}

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.values(PLANS)).map((plan) => {
          const price = plan.price_minor[currencyCode];
          const isCurrent = current?.plan === plan.id;
          return (
            <div
              key={plan.id}
              className="flex flex-col gap-3 rounded-xl border p-4"
              data-testid={`plan-${plan.id}`}
            >
              <h3 className="font-medium capitalize">{plan.id}</h3>
              <p className="text-2xl font-semibold">
                {plan.free ? t("freePrice") : price !== undefined ? money(price) : "—"}
                {!plan.free && price !== undefined && (
                  <span className="text-muted-foreground text-sm font-normal">
                    {" "}
                    {t("perMonth")}
                  </span>
                )}
              </p>
              <p className="text-muted-foreground text-sm">
                {t("quota", { n: String(plan.quota_projects) })}
              </p>
              {isCurrent ? (
                <span className="text-muted-foreground text-xs">{t("yourPlan")}</span>
              ) : plan.free ? (
                <span className="text-muted-foreground text-xs">{t("defaultPlan")}</span>
              ) : (
                <Button
                  size="sm"
                  disabled={busy !== null || price === undefined}
                  onClick={() => upgrade(plan.id)}
                >
                  {busy === plan.id ? t("starting") : t("choose")}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
