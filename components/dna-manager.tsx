"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { runEngineJob } from "@/lib/jobs/client";
import { THIN_SAMPLE, type Dna } from "@/types/dna";

export type DnaProfile = {
  id: string;
  name: string;
  dna: Dna | Record<string, never>;
  source_count: number;
};

export function DnaManager({
  userId,
  initialProfiles,
}: {
  userId: string;
  initialProfiles: DnaProfile[];
}) {
  const t = useTranslations("dna");
  const router = useRouter();

  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "uploading" | "analysing">("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = status !== "idle";

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
  }

  async function create() {
    if (!name.trim() || files.length === 0) return;
    setError(null);
    setStatus("uploading");

    const supabase = createClient();
    const paths: string[] = [];
    for (const file of files) {
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${userId}/dna/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("dna-assets")
        .upload(path, file, { contentType: file.type });
      if (upErr) {
        setStatus("idle");
        setError(t("uploadFailed"));
        return;
      }
      paths.push(path);
    }

    setStatus("analysing");
    const outcome = await runEngineJob("/api/dna", {
      body: { name: name.trim(), asset_paths: paths },
    });
    setStatus("idle");

    if (!outcome.ok) {
      setError(outcome.error || t("failed"));
      return;
    }

    setName("");
    setFiles([]);
    router.refresh(); // server re-reads the profile list with the filled DNA
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-medium">{t("createTitle")}</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("nameLabel")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("imagesLabel")}</span>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={onFiles}
            className="text-sm"
          />
          {files.length > 0 && (
            <span className="text-muted-foreground text-xs">
              {t("selected", { count: String(files.length) })}
            </span>
          )}
        </label>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <Button
          className="self-start"
          disabled={busy || !name.trim() || files.length === 0}
          onClick={create}
        >
          {status === "uploading"
            ? t("uploading")
            : status === "analysing"
              ? t("analysing")
              : t("createCta")}
        </Button>
        <p className="text-muted-foreground text-xs text-pretty">
          {t("thinHint", { n: String(THIN_SAMPLE) })}
        </p>
      </section>

      {initialProfiles.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">{t("yoursTitle")}</h2>
          {initialProfiles.map((p) => {
            const dna = "style_name" in p.dna ? (p.dna as Dna) : null;
            return (
              <article
                key={p.id}
                className="flex flex-col gap-2 rounded-xl border p-4"
                data-testid={`dna-profile-${p.id}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-medium">{p.name}</h3>
                  <span className="text-muted-foreground text-xs">
                    {t("fromImages", { count: String(p.source_count) })}
                  </span>
                </div>

                {dna ? (
                  <div className="flex flex-col gap-1.5 text-sm">
                    <p className="text-muted-foreground text-xs">{dna.style_name}</p>
                    <Chips label={t("materials")} items={dna.preferred_materials} />
                    <Chips label={t("colors")} items={dna.preferred_colors} />
                    <Chips label={t("layouts")} items={dna.preferred_layout_patterns} />
                    <Chips label={t("signature")} items={dna.signature_elements} />
                    {p.source_count < THIN_SAMPLE && (
                      <p className="text-xs text-amber-700 dark:text-amber-500">
                        {dna.confidence_note}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">{t("analysing")}</p>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-1.5">
      <span className="text-muted-foreground text-xs">{label}:</span>
      {items.map((item) => (
        <span key={item} className="bg-muted rounded-full px-2 py-0.5 text-xs">
          {item}
        </span>
      ))}
    </div>
  );
}
