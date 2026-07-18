import type { SupabaseClient } from "@supabase/supabase-js";

import { getPlan } from "./plans";

/**
 * Applies a completed subscription purchase — the step a payment webhook calls
 * after verifying the provider's event. Kept separate from the webhook so the
 * upgrade (the part with real consequences: the new quota) is unit-testable
 * without a live payment.
 *
 * Uses the service-role client: it runs from a webhook with no user session.
 */
export async function applyPlanUpgrade(
  svc: SupabaseClient,
  {
    ownerId,
    planId,
    provider,
    periodEnd,
  }: {
    ownerId: string;
    planId: string;
    provider: string;
    periodEnd?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const plan = getPlan(planId);
  if (!plan) return { ok: false, error: `unknown plan ${planId}` };

  // used_projects is display-only; create_project counts real rows, so an
  // upgrade never has to reconcile it here (Task 8's note).
  const { error } = await svc
    .from("subscriptions")
    .update({
      plan: plan.id,
      quota_projects: plan.quota_projects,
      provider,
      status: "active",
      period_end: periodEnd ?? null,
    })
    .eq("owner_id", ownerId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
