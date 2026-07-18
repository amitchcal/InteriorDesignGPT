import { costBoq } from "@/lib/boq/cost";
import { runBoqEngine } from "@/lib/engines/boq";
import { loadMarketProfile, loadRates } from "@/lib/market/load";
import { conceptSchema } from "@/types/concept";
import { intakeSchema } from "@/types/project";
import type { JobHandler } from "../types";

/** BOQ job — engine call, arithmetic recompute, and versioned persist. */
export const boqHandler: JobHandler = async (svc, job) => {
  const projectId = job.project_id;
  if (!projectId) throw new Error("boq job: missing project_id");

  const { data: project } = await svc
    .from("projects")
    .select("id, market_code, intake, status")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) throw new Error(`boq job: project ${projectId} gone`);

  const { data: latestConcept } = await svc
    .from("design_concepts")
    .select("version, concept")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latestConcept) throw new Error("boq job: no concept");

  const concept = conceptSchema.parse(latestConcept.concept);
  const intake = intakeSchema.parse(project.intake);

  const { data: rooms } = await svc
    .from("rooms")
    .select("name, length, width, ceiling_ht, unit, meta")
    .eq("project_id", projectId);

  const profile = await loadMarketProfile(svc, project.market_code);
  const rates = await loadRates(svc, project.market_code);
  if (rates.length === 0) throw new Error("boq job: no rates for market");

  const output = await runBoqEngine({
    market_profile: profile.config,
    intake: {
      floor_plan: rooms ?? [],
      client_brief: intake.client_brief,
      preferences: intake.preferences,
      cultural_overrides: intake.cultural_overrides,
    },
    concept,
    rate_library: rates,
  });

  // Arithmetic and rates recomputed — never trusted from the model (Task 8).
  const costed = costBoq({
    output,
    rates,
    taxRate: profile.config.tax.default_rate,
    budgetTotalMinor: intake.client_brief.budget_total_minor,
  });

  if (costed.arithmetic_drift.length) {
    console.warn("[boq] model arithmetic disagreed with computed", {
      project: projectId,
      drift: costed.arithmetic_drift,
    });
  }

  const overBudget = (costed.budget_delta_minor ?? 0) > 0;
  const value_engineering = overBudget ? output.value_engineering : [];
  const version = latestConcept.version ?? 1;

  await svc.from("boq_items").delete().eq("project_id", projectId).eq("version", version);
  await svc.from("boq_summaries").delete().eq("project_id", projectId).eq("version", version);

  const { error: itemsError } = await svc.from("boq_items").insert(
    costed.items.map((item) => ({
      project_id: projectId,
      version,
      room: item.room,
      item_code: item.item_code ?? null,
      spec: item.spec,
      qty: item.qty,
      unit: item.unit,
      rate_minor: item.rate_minor,
      amount_minor: item.amount_minor,
      tier: item.tier,
    })),
  );
  if (itemsError) throw new Error(`boq job: items persist: ${itemsError.message}`);

  const { error: summaryError } = await svc.from("boq_summaries").insert({
    project_id: projectId,
    version,
    subtotal_minor: costed.subtotal_minor,
    tax_minor: costed.tax_minor,
    total_minor: costed.total_minor,
    currency: profile.config.currency.code,
    budget_delta_minor: costed.budget_delta_minor,
    value_eng: value_engineering,
  });
  if (summaryError) throw new Error(`boq job: summary persist: ${summaryError.message}`);

  if (project.status === "concept") {
    await svc.from("projects").update({ status: "boq" }).eq("id", projectId);
  }

  return { version, item_count: costed.items.length, total_minor: costed.total_minor };
};
