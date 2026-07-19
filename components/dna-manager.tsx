"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { runEngineJob } from "@/lib/jobs/client";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  THIN_SAMPLE,
  type Dna,
} from "@/types/dna";

export type DnaProfile = {
  id: string;
  name: string;
  dna: Dna | Record<string, never>;
  source_count: number;
};

/** A picked file plus its preview object-URL, so the grid can render a thumbnail. */
type PickedImage = { file: File; url: string };

const ACCEPTED = new Set<string>(ACCEPTED_IMAGE_TYPES);

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
  const [images, setImages] = useState<PickedImage[]>([]);
  const [status, setStatus] = useState<"idle" | "uploading" | "analysing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const busy = status !== "idle";

  // Revoke any outstanding object-URLs when the component unmounts, without
  // revoking URLs still in use on every render — a ref holds the latest list.
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(
    () => () => {
      for (const img of imagesRef.current) URL.revokeObjectURL(img.url);
    },
    [],
  );

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    // Allow re-picking the same file after a removal.
    e.target.value = "";
    if (picked.length === 0) return;

    setError(null);
    const skipped: string[] = [];
    const accepted: PickedImage[] = [];

    for (const file of picked) {
      if (!ACCEPTED.has(file.type)) {
        skipped.push(t("skippedType", { name: file.name }));
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        skipped.push(t("skippedSize", { name: file.name }));
        continue;
      }
      accepted.push({ file, url: URL.createObjectURL(file) });
    }

    setImages((prev) => {
      const room = MAX_IMAGES - prev.length;
      const toAdd = accepted.slice(0, Math.max(0, room));
      // Revoke previews for any that didn't fit the 40-image cap.
      for (const overflow of accepted.slice(toAdd.length)) {
        URL.revokeObjectURL(overflow.url);
        skipped.push(t("skippedMax", { max: String(MAX_IMAGES) }));
      }
      return [...prev, ...toAdd];
    });

    setNotice(skipped.length > 0 ? skipped.join(" · ") : null);
  }

  function removeImage(url: string) {
    URL.revokeObjectURL(url);
    setImages((prev) => prev.filter((img) => img.url !== url));
  }

  function clearImages() {
    for (const img of imagesRef.current) URL.revokeObjectURL(img.url);
    setImages([]);
  }

  async function create() {
    if (!name.trim() || images.length === 0) return;
    setError(null);
    setNotice(null);
    setStatus("uploading");

    const supabase = createClient();
    const paths: string[] = [];
    for (const { file } of images) {
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
    clearImages();
    router.refresh(); // server re-reads the profile list with the filled DNA
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-medium">{t("createTitle")}</h2>

        {/* Upload guidance so a designer knows what to send before picking files. */}
        <div className="bg-muted/50 flex flex-col gap-1 rounded-lg p-3 text-xs">
          <p className="text-foreground font-medium">{t("guideTitle")}</p>
          <ul className="text-muted-foreground flex flex-col gap-0.5">
            <li>• {t("guideCount", { min: String(THIN_SAMPLE), max: String(MAX_IMAGES) })}</li>
            <li>• {t("guideFormats")}</li>
            <li>• {t("guideSize")}</li>
            <li>• {t("guideResolution")}</li>
          </ul>
        </div>

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
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            onChange={onFiles}
            disabled={busy}
            className="text-sm"
          />
          <span className="text-muted-foreground text-xs">
            {t("selectedCount", { count: String(images.length), max: String(MAX_IMAGES) })}
          </span>
        </label>

        {images.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((img, i) => (
              <li
                key={img.url}
                className="group relative aspect-square overflow-hidden rounded-md border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, never optimized */}
                <img
                  src={img.url}
                  alt={t("previewAlt", { n: String(i + 1) })}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.url)}
                  disabled={busy}
                  aria-label={t("removeImage")}
                  className="bg-background/80 text-foreground absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs leading-none shadow-sm"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {notice && (
          <p className="text-xs text-amber-700 dark:text-amber-500">{notice}</p>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <Button
          className="self-start"
          disabled={busy || !name.trim() || images.length === 0}
          onClick={create}
        >
          {status === "uploading"
            ? t("uploading")
            : status === "analysing"
              ? t("analysing")
              : t("createCta")}
        </Button>
        {images.length > 0 && images.length < THIN_SAMPLE && (
          <p className="text-xs text-amber-700 dark:text-amber-500">
            {t("thinHint", { n: String(THIN_SAMPLE) })}
          </p>
        )}
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
