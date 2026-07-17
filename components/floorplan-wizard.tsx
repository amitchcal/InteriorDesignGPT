"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { LOW_CONFIDENCE, type ParsedRoom } from "@/types/floorplan";

type Row = {
  name: string;
  length: string;
  width: string;
  ceiling_ht: string;
  doors: string;
  windows: string;
  /** Null for manually-added rows — nothing was parsed, so nothing to flag. */
  confidence: number | null;
};

const toRow = (room: ParsedRoom): Row => ({
  name: room.name,
  length: room.length?.toString() ?? "",
  width: room.width?.toString() ?? "",
  ceiling_ht: room.ceiling_ht?.toString() ?? "",
  doors: room.doors?.toString() ?? "",
  windows: room.windows?.toString() ?? "",
  confidence: room.confidence,
});

const emptyRow = (): Row => ({
  name: "",
  length: "",
  width: "",
  ceiling_ht: "",
  doors: "",
  windows: "",
  confidence: null,
});

export function FloorPlanWizard({
  projectId,
  userId,
  locale,
  unit,
  defaultCeiling,
}: {
  projectId: string;
  userId: string;
  locale: string;
  unit: "m" | "ft";
  defaultCeiling: number | null;
}) {
  const t = useTranslations("floorplan");
  const router = useRouter();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [floorPlanId, setFloorPlanId] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "parsing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const busy = status !== "idle";

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setNotes(null);
    setStatus("uploading");

    // Path must start with the uid — the storage policy authorizes on the
    // leading segment (0004).
    const safeName = file.name.replace(/[^\w.\-]/g, "_");
    const path = `${userId}/${projectId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await createClient()
      .storage.from("floor-plans")
      .upload(path, file, { upsert: false, contentType: file.type });

    if (uploadError) {
      setStatus("idle");
      setError(t("uploadFailed"));
      return;
    }

    setStatus("parsing");

    const res = await fetch(`/api/projects/${projectId}/floorplan/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_path: path }),
    });

    const payload = await res.json().catch(() => null);
    setStatus("idle");

    if (!res.ok) {
      // Parse is best-effort — never a dead end. Drop the user into manual
      // entry with the upload still attached (E1-5).
      setFloorPlanId(payload?.floor_plan_id ?? null);
      setRows([emptyRow()]);
      setError(payload?.error?.message ?? t("parseFailed"));
      return;
    }

    setFloorPlanId(payload.floor_plan_id);
    setNotes(payload.parsed?.notes ?? null);
    setRows(
      payload.parsed.rooms.length
        ? payload.parsed.rooms.map(toRow)
        : [emptyRow()],
    );
  }

  function startManual() {
    setError(null);
    setNotes(null);
    setFloorPlanId(null);
    setRows([emptyRow()]);
  }

  function update(index: number, key: keyof Row, value: string) {
    setRows((prev) =>
      prev!.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  }

  async function onConfirm() {
    setError(null);
    setFields({});
    setStatus("saving");

    const body = {
      floor_plan_id: floorPlanId,
      rooms: rows!.map((row) => ({
        name: row.name.trim(),
        length: Number(row.length),
        width: Number(row.width),
        ceiling_ht: row.ceiling_ht ? Number(row.ceiling_ht) : defaultCeiling,
        unit,
        meta: {
          doors: row.doors ? Number(row.doors) : null,
          windows: row.windows ? Number(row.windows) : null,
        },
      })),
    };

    const res = await fetch(`/api/projects/${projectId}/floorplan/confirm`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setStatus("idle");

    if (res.ok) {
      router.push(`/${locale}/projects/${projectId}`);
      router.refresh();
      return;
    }

    const payload = await res.json().catch(() => null);
    setError(payload?.error?.message ?? t("saveFailed"));
    if (payload?.error?.fields) setFields(payload.error.fields);
  }

  if (!rows) {
    return (
      <div className="flex flex-col gap-4">
        <label className="border-input flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <span className="text-sm font-medium">{t("uploadCta")}</span>
          <span className="text-muted-foreground text-xs">{t("uploadHint")}</span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            disabled={busy}
            onChange={onFile}
          />
        </label>

        {busy && (
          <p className="text-muted-foreground text-sm" role="status">
            {status === "uploading" ? t("uploading") : t("parsing")}
          </p>
        )}

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        {/* The fallback must always be reachable — never gated on a parse. */}
        <button
          type="button"
          onClick={startManual}
          disabled={busy}
          className="text-muted-foreground text-sm underline underline-offset-4"
        >
          {t("manualCta")}
        </button>
      </div>
    );
  }

  const lowConfidence = rows.some(
    (r) => r.confidence !== null && r.confidence < LOW_CONFIDENCE,
  );

  return (
    <div className="flex flex-col gap-4">
      {notes && (
        <p className="text-muted-foreground rounded-lg border px-3 py-2 text-xs text-pretty">
          {notes}
        </p>
      )}

      {lowConfidence && (
        <p className="text-sm text-amber-700 dark:text-amber-500">
          {t("checkFlagged")}
        </p>
      )}

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((row, i) => {
          const uncertain =
            row.confidence !== null && row.confidence < LOW_CONFIDENCE;
          return (
            <div
              key={i}
              className={`flex flex-col gap-2 rounded-lg border p-3 ${
                uncertain ? "border-amber-500/60" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  value={row.name}
                  placeholder={t("roomName")}
                  onChange={(e) => update(i, "name", e.target.value)}
                  className="border-input bg-background flex-1 rounded-md border px-2 py-1 text-sm"
                />
                {row.confidence !== null && (
                  <span
                    className={`text-xs ${uncertain ? "text-amber-600" : "text-muted-foreground"}`}
                  >
                    {t("confidence", {
                      pct: Math.round(row.confidence * 100),
                    })}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={t("removeRoom")}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  className="text-muted-foreground px-1 text-sm"
                >
                  ×
                </button>
              </div>

              {/* Every dimension editable — the correction loop is the point. */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Field
                  label={t("length", { unit })}
                  value={row.length}
                  onChange={(v) => update(i, "length", v)}
                  error={fields[`rooms.${i}.length`]}
                />
                <Field
                  label={t("width", { unit })}
                  value={row.width}
                  onChange={(v) => update(i, "width", v)}
                  error={fields[`rooms.${i}.width`]}
                />
                <Field
                  label={t("ceiling", { unit })}
                  value={row.ceiling_ht}
                  onChange={(v) => update(i, "ceiling_ht", v)}
                />
                <Field
                  label={t("doors")}
                  value={row.doors}
                  onChange={(v) => update(i, "doors", v)}
                />
                <Field
                  label={t("windows")}
                  value={row.windows}
                  onChange={(v) => update(i, "windows", v)}
                />
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setRows([...rows, emptyRow()])}
        className="text-muted-foreground self-start text-sm underline underline-offset-4"
      >
        {t("addRoom")}
      </button>

      <Button onClick={onConfirm} disabled={busy}>
        {status === "saving" ? t("saving") : t("confirmCta")}
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <input
        type="number"
        step="any"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-background rounded-md border px-2 py-1 text-sm"
      />
      {error && <span className="text-destructive text-xs">{error}</span>}
    </label>
  );
}
