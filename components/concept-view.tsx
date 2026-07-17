"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { RoomRender } from "@/components/room-render";
import type { Concept } from "@/types/concept";

export function ConceptView({
  projectId,
  initialConcept,
  initialVersion,
  canGenerate,
}: {
  projectId: string;
  initialConcept: Concept | null;
  initialVersion: number | null;
  canGenerate: boolean;
}) {
  const t = useTranslations("concept");
  const router = useRouter();

  const [concept, setConcept] = useState(initialConcept);
  const [version, setVersion] = useState(initialVersion);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(room?: string) {
    setBusy(room ?? "__all__");
    setError(null);

    const res = await fetch(`/api/projects/${projectId}/concept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(room ? { room } : {}),
    });

    setBusy(null);

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      setError(payload?.error?.message ?? t("failed"));
      return;
    }

    const body = await res.json();
    setConcept(body.concept);
    setVersion(body.version);
    router.refresh();
  }

  if (!concept) {
    return (
      <div className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button
          disabled={!canGenerate || busy !== null}
          onClick={() => generate()}
          className="self-start"
        >
          {busy ? t("generating") : t("generateCta")}
        </Button>
        {!canGenerate && (
          <p className="text-muted-foreground text-xs">{t("gateFirst")}</p>
        )}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("title", { version: String(version ?? 1) })}
          </h2>
          <p className="text-muted-foreground text-sm text-pretty">
            {concept.overall_direction}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => generate()}
        >
          {busy === "__all__" ? t("generating") : t("regenerateAll")}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {concept.applied_cultural_rules.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {t("appliedRules", { rules: concept.applied_cultural_rules.join(", ") })}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {concept.rooms.map((room) => (
          <article
            key={room.name}
            className="flex flex-col gap-3 rounded-xl border p-4"
            data-testid={`concept-room-${room.name}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">{room.name}</h3>
                <p className="text-muted-foreground text-xs">
                  {room.style_direction}
                </p>
              </div>
              {/* E2-4: regenerate one room without redoing the project. */}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => generate(room.name)}
              >
                {busy === room.name ? t("generating") : t("regenerateRoom")}
              </Button>
            </div>

            <p className="text-sm text-pretty">{room.zoning_rationale}</p>

            {room.key_features.length > 0 && (
              <Block label={t("features")} items={room.key_features} />
            )}

            {/* E2-2: ergonomic issues per the market's standards. */}
            {room.clearance_flags.length > 0 && (
              <div
                className="rounded-lg border border-amber-500/50 p-2"
                data-testid={`clearance-${room.name}`}
              >
                <Block
                  label={t("clearances")}
                  items={room.clearance_flags}
                  tone="text-amber-700 dark:text-amber-500"
                />
              </div>
            )}

            {/* E2-3: cultural trade-offs, never silently resolved. */}
            {room.cultural_notes.length > 0 && (
              <div
                className="bg-muted/40 rounded-lg p-2"
                data-testid={`cultural-${room.name}`}
              >
                <Block label={t("cultural")} items={room.cultural_notes} />
              </div>
            )}

            {/* E4-3 (Should): the brief, copyable into an external tool. */}
            <details className="text-sm">
              <summary className="text-muted-foreground cursor-pointer text-xs">
                {t("renderBrief")}
              </summary>
              <div className="mt-2 flex flex-col gap-2 text-xs">
                <Row label={t("lighting")} value={room.render_brief.lighting} />
                <Row
                  label={t("materials")}
                  value={room.render_brief.key_materials.join(", ")}
                />
                <Row
                  label={t("palette")}
                  value={room.render_brief.palette.join(", ")}
                />
                <Row
                  label={t("cameras")}
                  value={room.render_brief.camera_angles.join(" · ")}
                />
              </div>
            </details>

            {/* E4-2: render this room from its brief. */}
            <RoomRender projectId={projectId} room={room.name} />
          </article>
        ))}
      </div>

      {concept.assumptions.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-medium">
            {t("assumptions")}
          </p>
          <ul className="text-muted-foreground list-disc pl-5 text-xs">
            {concept.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Block({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className={`text-xs font-medium ${tone ?? "text-muted-foreground"}`}>
        {label}
      </p>
      <ul className={`list-disc pl-5 text-sm ${tone ?? ""}`}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="text-pretty">{value}</span>
    </div>
  );
}
