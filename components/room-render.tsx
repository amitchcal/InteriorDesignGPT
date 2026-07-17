"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { RenderStatus } from "@/types/render";

/**
 * Dispatches a room render and polls to completion (E4-2). Lives inside the
 * concept view, next to the render brief it renders from (E4-3).
 *
 * Polling is client-side and best-effort: a render is optional, and a failed
 * or slow one must never block the concept the user came for.
 */
export function RoomRender({
  projectId,
  room,
}: {
  projectId: string;
  room: string;
}) {
  const t = useTranslations("render");

  const [status, setStatus] = useState<RenderStatus | "idle">("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function start() {
    setError(null);
    setImageUrl(null);
    setStatus("queued");

    const res = await fetch(`/api/projects/${projectId}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room }),
    });

    if (!res.ok) {
      setStatus("failed");
      const p = await res.json().catch(() => null);
      setError(p?.error?.message ?? t("failed"));
      return;
    }

    const { render_job_id } = await res.json();
    poll(render_job_id, 0);
  }

  function poll(jobId: string, attempt: number) {
    // Give up after ~4 minutes (renders are seconds-to-a-minute; this is slack).
    if (attempt > 80) {
      setStatus("failed");
      setError(t("timedOut"));
      return;
    }

    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/render/${jobId}`);
      if (!res.ok) {
        // Transient — keep trying.
        poll(jobId, attempt + 1);
        return;
      }
      const body: { status: RenderStatus; output_url?: string } = await res.json();

      if (body.status === "done" && body.output_url) {
        setStatus("done");
        setImageUrl(body.output_url);
        return;
      }
      if (body.status === "failed") {
        setStatus("failed");
        setError(t("failed"));
        return;
      }
      setStatus(body.status);
      poll(jobId, attempt + 1);
    }, 3000);
  }

  const busy = status === "queued" || status === "running";

  return (
    <div className="flex flex-col gap-2">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={t("alt", { room })}
          className="w-full rounded-lg border"
          data-testid={`render-image-${room}`}
        />
      ) : null}

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}

      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={start}
        className="self-start"
        data-testid={`render-btn-${room}`}
      >
        {busy
          ? t("rendering")
          : imageUrl
            ? t("regenerate")
            : t("render")}
      </Button>
    </div>
  );
}
