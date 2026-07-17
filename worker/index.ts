import { hostname } from "node:os";

import { createServiceClient } from "@/lib/supabase/service";
import { EngineError, EngineOutputError } from "@/lib/engines/client";
import { handlers } from "@/lib/jobs/handlers";
import type { Job } from "@/lib/jobs/types";

/**
 * Background worker (docs/infra.md).
 *
 * The only persistent process in the stack. It claims queued jobs one at a time
 * via claim_job() (FOR UPDATE SKIP LOCKED — safe to run several of these) and
 * runs the engine handler. Concept/BOQ/Proposal take 2-4 minutes each; running
 * them here instead of in a request is what keeps them off the serverless
 * timeout.
 *
 * Run: `npm run worker`. Uses the service role, so it must never be exposed to a
 * browser — it's a standalone Node process, not a route.
 */

const WORKER_ID = `${hostname()}-${process.pid}`;
const IDLE_MS = 1500;

function isRetryable(error: unknown): boolean {
  // A provider hiccup is worth another attempt; a schema mismatch or a bug is
  // not — retrying a malformed-output job just burns tokens on the same result.
  return error instanceof EngineError && !(error instanceof EngineOutputError);
}

async function runOnce(svc: ReturnType<typeof createServiceClient>): Promise<boolean> {
  const { data, error } = await svc.rpc("claim_job", { p_worker: WORKER_ID });
  if (error) {
    console.error("[worker] claim failed:", error.message);
    return false;
  }
  const job = (data as Job[] | null)?.[0];
  if (!job) return false; // queue empty

  console.log(`[worker] ${job.kind} job ${job.id} (attempt ${job.attempts})`);
  const started = Date.now();

  try {
    const handler = handlers[job.kind];
    if (!handler) throw new Error(`no handler for kind '${job.kind}'`);

    const result = await handler(svc, job);
    await svc
      .from("jobs")
      .update({ status: "done", result, error: null, updated_at: new Date().toISOString() })
      .eq("id", job.id);
    console.log(`[worker] ${job.id} done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retry = isRetryable(err) && job.attempts < job.max_attempts;

    await svc
      .from("jobs")
      .update({
        // Requeue by returning to 'queued'; give up at max_attempts.
        status: retry ? "queued" : "failed",
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.error(
      `[worker] ${job.id} ${retry ? "requeued" : "failed"}: ${message}`,
    );
  }
  return true;
}

async function main() {
  const svc = createServiceClient();
  console.log(`[worker] ${WORKER_ID} polling`);

  let stopping = false;
  process.on("SIGINT", () => {
    console.log("[worker] stopping after current job");
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  while (!stopping) {
    const worked = await runOnce(svc);
    if (!worked) await new Promise((r) => setTimeout(r, IDLE_MS));
  }
  process.exit(0);
}

void main();
