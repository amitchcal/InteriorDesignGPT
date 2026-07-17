"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CulturalRule } from "@/types/market";
import type { ValidationResult } from "@/types/validation";

/** Human-readable labels for the paths the gate reports. */
function fieldLabel(path: string, t: (k: string, v?: Record<string, string>) => string) {
  const room = path.match(/^rooms\[(\d+)\]\.ceiling_ht$/);
  if (room) return t("field.roomCeiling", { n: String(Number(room[1]) + 1) });
  const key = `field.${path}`;
  const label = t(key);
  return label === key ? path : label;
}

export function ValidationGate({
  projectId,
  rules,
}: {
  projectId: string;
  rules: CulturalRule[];
}) {
  const t = useTranslations("validate");
  const router = useRouter();

  const [result, setResult] = useState<ValidationResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyResult = useCallback(
    (body: ValidationResult) => {
      setResult(body);
      // Seed each pending toggle from the market's default — the user is
      // confirming or overriding it, so show what they'd be agreeing to.
      setAnswers(
        Object.fromEntries(
          body.cultural_confirmations.map((id) => [
            id,
            rules.find((r) => r.id === id)?.default_on ?? false,
          ]),
        ),
      );
    },
    [rules],
  );

  // Runs the gate on mount. `busy` already starts true, so nothing is set
  // synchronously here — the state updates all happen after the await, which is
  // what keeps this from cascading renders.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch(`/api/projects/${projectId}/validate`, {
        method: "POST",
      });
      if (cancelled) return; // navigated away mid-flight
      if (!res.ok) {
        setError(t("failed"));
        setBusy(false);
        return;
      }
      applyResult(await res.json());
      setBusy(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, applyResult, t]);

  /** Re-runs the gate after the user answers something. */
  async function rerun() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/validate`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError(t("failed"));
      return;
    }
    applyResult(await res.json());
  }

  async function confirmCultural() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/cultural`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: answers }),
    });
    if (!res.ok) {
      setBusy(false);
      setError(t("failed"));
      return;
    }
    await rerun();
    router.refresh();
  }

  if (busy && !result) {
    return <p className="text-muted-foreground text-sm">{t("checking")}</p>;
  }
  if (!result) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {error ?? t("failed")}
      </p>
    );
  }

  if (result.ok) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-emerald-600/40 p-3">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-500">
          {t("ready")}
        </p>
        <p className="text-muted-foreground text-xs text-pretty">{t("readyHint")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">{t("blockedTitle")}</h2>
        <p className="text-muted-foreground text-xs text-pretty">{t("blockedHint")}</p>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {result.missing.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t("missingTitle")}</p>
          <ul className="text-destructive list-disc pl-5 text-sm">
            {result.missing.map((m) => (
              <li key={m} data-testid={`missing-${m}`}>
                {fieldLabel(m, t)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.cultural_confirmations.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t("confirmTitle")}</p>
          {result.cultural_confirmations.map((id) => {
            const rule = rules.find((r) => r.id === id);
            return (
              <label key={id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  data-testid={`confirm-${id}`}
                  checked={answers[id] ?? false}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [id]: e.target.checked }))
                  }
                />
                <span>
                  {rule?.label ?? id}
                  {rule?.constraints?.length ? (
                    <span className="text-muted-foreground block text-xs">
                      {rule.constraints.slice(0, 3).join(" · ")}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
          <Button size="sm" className="self-start" disabled={busy} onClick={confirmCultural}>
            {busy ? t("saving") : t("confirmCta")}
          </Button>
        </div>
      )}
    </div>
  );
}
