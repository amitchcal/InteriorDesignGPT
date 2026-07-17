/**
 * Client-side helper: POST to an engine route that enqueues, then poll the job
 * to completion. One place for the enqueue→poll loop the three engine views
 * share.
 */

export type JobOutcome =
  | { ok: true; result: Record<string, unknown> | null }
  | { ok: false; error: string };

export async function runEngineJob(
  startUrl: string,
  {
    body,
    onStatus,
    signal,
  }: {
    body?: unknown;
    onStatus?: (status: string) => void;
    signal?: AbortSignal;
  } = {},
): Promise<JobOutcome> {
  const res = await fetch(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal,
  });

  if (!res.ok) {
    const p = await res.json().catch(() => null);
    return { ok: false, error: p?.error?.message ?? "Request failed." };
  }

  const { job_id } = await res.json();
  if (!job_id) return { ok: false, error: "No job was created." };

  // Engines run 1-4 minutes; poll every 2.5s, give up after ~6 minutes.
  for (let i = 0; i < 144; i++) {
    if (signal?.aborted) return { ok: false, error: "cancelled" };
    await new Promise((r) => setTimeout(r, 2500));

    const pr = await fetch(`/api/jobs/${job_id}`, { signal });
    if (!pr.ok) continue; // transient — keep polling
    const pj: { status: string; result?: Record<string, unknown>; error?: string } =
      await pr.json();

    onStatus?.(pj.status);
    if (pj.status === "done") return { ok: true, result: pj.result ?? null };
    if (pj.status === "failed") {
      return { ok: false, error: pj.error ?? "The job failed." };
    }
  }

  return { ok: false, error: "The job is taking longer than expected." };
}
