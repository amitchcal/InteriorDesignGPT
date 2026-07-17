"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import type { Tier } from "@/types/market";

/** The subset of a market_profile the intake form renders from. */
export type MarketOption = {
  market_code: string;
  display_name: string;
  locale: string;
  currency: { code: string; symbol: string; format: string };
  units: "metric" | "imperial";
  area_basis: string;
  tax: { name: string; default_rate: number; applies_to: string };
  cultural_rules: {
    id: string;
    label: string;
    default_on: boolean;
    constraints: string[];
  }[];
  construction_modes: string[];
  brand_tiers: Record<Tier, string[]>;
};

const TIERS: Tier[] = ["economy", "premium", "luxury"];

export function IntakeForm({
  markets,
  locale,
}: {
  markets: MarketOption[];
  locale: string;
}) {
  const t = useTranslations("intake");
  const router = useRouter();

  const [marketCode, setMarketCode] = useState(markets[0]?.market_code ?? "");
  const market = useMemo(
    () => markets.find((m) => m.market_code === marketCode) ?? markets[0],
    [markets, marketCode],
  );

  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [ceiling, setCeiling] = useState("");
  const [tier, setTier] = useState<Tier>("premium");
  const [mode, setMode] = useState("");
  const [notes, setNotes] = useState("");

  // Cultural toggles default to the market's `default_on` — vastu on for IN,
  // feng-shui off for US. Re-derived per market so switching markets resets
  // them rather than carrying another market's answers across.
  const [cultural, setCultural] = useState<Record<string, boolean>>({});
  const culturalFor = (m: MarketOption) =>
    Object.fromEntries(m.cultural_rules.map((r) => [r.id, r.default_on]));
  const culturalState = useMemo(() => {
    const defaults = market ? culturalFor(market) : {};
    return { ...defaults, ...pick(cultural, Object.keys(defaults)) };
  }, [market, cultural]);

  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  if (!market) return null;

  const lengthUnit = market.units === "metric" ? "m" : "ft";
  const minorPerMajor = 100; // INR/USD; formatMoney derives this properly server-side

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFields({});
    setPending(true);

    const body = {
      name,
      market_code: market.market_code,
      intake: {
        client_brief: {
          budget_total_minor: Math.round(Number(budget) * minorPerMajor),
          ceiling_height: Number(ceiling),
          ceiling_height_unit: lengthUnit,
          ...(notes.trim() && { notes: notes.trim() }),
        },
        preferences: {
          tier,
          ...(mode && { construction_mode: mode }),
        },
        cultural_overrides: culturalState,
      },
    };

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setPending(false);

    if (res.ok) {
      const { id } = await res.json();
      router.push(`/${locale}/projects/${id}`);
      router.refresh();
      return;
    }

    const payload = await res.json().catch(() => null);
    // Localised copy by code, per the interface's voice; `fields` is shown inline.
    setError(payload?.error?.code ? t(`errors.${payload.error.code}`) : t("errors.server_error"));
    if (payload?.error?.fields) setFields(payload.error.fields);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t("projectName")}</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2"
        />
        <FieldError message={fields.name} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t("market")}</span>
        <select
          value={marketCode}
          onChange={(e) => setMarketCode(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2"
        >
          {markets.map((m) => (
            <option key={m.market_code} value={m.market_code}>
              {m.display_name}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground text-xs">
          {t("marketHint", {
            currency: market.currency.code,
            units: t(`units.${market.units}`),
            tax: market.tax.name,
          })}
        </span>
      </label>

      {/* Currency symbol comes from the profile — never hardcoded. */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">
          {t("budget", { symbol: market.currency.symbol })}
        </span>
        <input
          required
          type="number"
          min="1"
          step="any"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2"
        />
        <FieldError message={fields["client_brief.budget_total_minor"]} />
      </label>

      {/* Unit label follows market_profile.units. */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">
          {t("ceilingHeight", { unit: lengthUnit })}
        </span>
        <input
          required
          type="number"
          min="0.1"
          step="any"
          value={ceiling}
          onChange={(e) => setCeiling(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2"
        />
        <FieldError message={fields["client_brief.ceiling_height"]} />
      </label>

      {/* Tier options list the market's own brands. */}
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="text-muted-foreground mb-1">{t("tier")}</legend>
        {TIERS.map((value) => (
          <label key={value} className="flex items-start gap-2">
            <input
              type="radio"
              name="tier"
              value={value}
              checked={tier === value}
              onChange={() => setTier(value)}
              className="mt-1"
            />
            <span>
              <span className="capitalize">{t(`tiers.${value}`)}</span>
              <span className="text-muted-foreground block text-xs">
                {market.brand_tiers[value]?.join(", ")}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {market.construction_modes.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("constructionMode")}</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          >
            <option value="">{t("noPreference")}</option>
            {market.construction_modes.map((m) => (
              <option key={m} value={m}>
                {m.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Cultural rules come from the profile: IN shows a vastu toggle (on),
          US shows feng-shui (off). No country logic here. */}
      {market.cultural_rules.length > 0 && (
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="text-muted-foreground mb-1">{t("cultural")}</legend>
          {market.cultural_rules.map((rule) => (
            <label key={rule.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={culturalState[rule.id] ?? false}
                onChange={(e) =>
                  setCultural((prev) => ({
                    ...prev,
                    [rule.id]: e.target.checked,
                  }))
                }
                className="mt-1"
                data-testid={`cultural-${rule.id}`}
              />
              <span>
                {rule.label}
                <span className="text-muted-foreground block text-xs">
                  {rule.constraints.slice(0, 2).join(" · ")}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t("notes")}</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2"
        />
      </label>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? t("creating") : t("create")}
      </Button>
    </form>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="text-destructive text-xs">{message}</span>;
}

function pick<T extends object>(obj: T, keys: string[]) {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => keys.includes(k)),
  );
}
