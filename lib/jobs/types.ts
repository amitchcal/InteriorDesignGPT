import type { SupabaseClient } from "@supabase/supabase-js";

export const jobKinds = ["concept", "boq", "proposal", "dna"] as const;
export type JobKind = (typeof jobKinds)[number];

export type JobStatus = "queued" | "running" | "done" | "failed";

export type Job = {
  id: string;
  /** Null for DNA jobs — they're user-scoped, not project-scoped (0014). */
  project_id: string | null;
  owner_id: string;
  kind: JobKind;
  status: JobStatus;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

/**
 * A handler runs one kind of job. It receives the **service-role** client — it
 * runs outside any request, so RLS doesn't apply and ownership was already
 * checked at enqueue (enqueue_job → owns_project). It persists the result the
 * same way the old inline route did, and returns a small summary for the job's
 * `result` column (what the poller/UI shows).
 *
 * A thrown EngineError/EngineOutputError is a provider problem the worker may
 * retry; any other throw is a bug.
 */
export type JobHandler = (
  svc: SupabaseClient,
  job: Job,
) => Promise<Record<string, unknown>>;
