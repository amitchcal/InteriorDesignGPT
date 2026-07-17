"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { runEngineJob } from "@/lib/jobs/client";

export function ProposalView({
  projectId,
  hasBoq,
  existingVersion,
}: {
  projectId: string;
  hasBoq: boolean;
  existingVersion: number | null;
}) {
  const t = useTranslations("proposal");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ version: number; url: string } | null>(
    null,
  );

  async function generate() {
    setBusy(true);
    setError(null);

    // Enqueue + poll — copy + PDF render run ~105s on the worker.
    const outcome = await runEngineJob(`/api/projects/${projectId}/proposal`);
    if (!outcome.ok) {
      setBusy(false);
      setError(outcome.error === "cancelled" ? null : outcome.error || t("failed"));
      return;
    }

    // Job done — mint a fresh signed URL for the finished PDF.
    const res = await fetch(`/api/projects/${projectId}/proposal`);
    setBusy(false);
    if (!res.ok) {
      setError(t("failed"));
      return;
    }
    const body = await res.json();
    setResult({ version: body.version, url: body.pdf_url });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {result ? (
        <div className="flex flex-col gap-2 rounded-lg border border-emerald-600/40 p-3">
          <p className="text-sm">{t("ready", { version: String(result.version) })}</p>
          <a
            href={result.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline underline-offset-4"
            data-testid="proposal-download"
          >
            {t("download")}
          </a>
          {/* The link is a signed URL — say so, so nobody pastes it to a client
              expecting it to keep working. */}
          <p className="text-muted-foreground text-xs">{t("linkNote")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            className="self-start"
            disabled={!hasBoq || busy}
            onClick={generate}
          >
            {busy
              ? t("generating")
              : existingVersion
                ? t("regenerate")
                : t("generateCta")}
          </Button>
          {!hasBoq && <p className="text-muted-foreground text-xs">{t("boqFirst")}</p>}
        </div>
      )}
    </section>
  );
}
