import { runProposalEngine } from "@/lib/engines/proposal";
import { getMessages } from "@/lib/i18n/messages";
import { loadMarketProfile } from "@/lib/market/load";
import { formatMoney } from "@/lib/market/money";
import { renderProposalPdf } from "@/lib/pdf/proposal";
import type { ValueEngineeringOption } from "@/types/boq";
import type { JobHandler } from "../types";

/** Proposal job — engine copy, PDF render, private upload, persist. */
export const proposalHandler: JobHandler = async (svc, job) => {
  const projectId = job.project_id;
  if (!projectId) throw new Error("proposal job: missing project_id");

  const { data: project } = await svc
    .from("projects")
    .select("id, name, market_code, intake, status, owner_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) throw new Error(`proposal job: project ${projectId} gone`);

  const { data: summary } = await svc
    .from("boq_summaries")
    .select("version, subtotal_minor, tax_minor, total_minor, budget_delta_minor, value_eng")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!summary) throw new Error("proposal job: no BOQ");

  const { data: latestConcept } = await svc
    .from("design_concepts")
    .select("concept")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latestConcept) throw new Error("proposal job: no concept");

  const { conceptSchema } = await import("@/types/concept");
  const concept = conceptSchema.parse(latestConcept.concept);

  const profile = await loadMarketProfile(svc, project.market_code);
  const { currency, locale } = profile.config;
  const money = (minor: number) => formatMoney(minor, currency, locale);

  const { count: itemCount } = await svc
    .from("boq_items")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("version", summary.version);

  const ve = (summary.value_eng ?? []) as ValueEngineeringOption[];
  const over = (summary.budget_delta_minor ?? 0) > 0;

  const copy = await runProposalEngine({
    market_profile: profile.config,
    intake: project.intake,
    concept,
    boq: {
      total: money(summary.total_minor),
      subtotal: money(summary.subtotal_minor),
      tax: money(summary.tax_minor),
      tax_name: profile.config.tax.name,
      budget_status:
        summary.budget_delta_minor === null
          ? null
          : `${over ? "over" : "under"} budget by ${money(Math.abs(summary.budget_delta_minor))}`,
      item_count: itemCount ?? 0,
      value_engineering: ve.map((o) => ({
        label: o.label,
        saving: money(Math.abs(o.delta_minor)),
        note: o.note,
      })),
    },
    designer_brand: null,
  });

  const { data: profileRow } = await svc
    .from("profiles")
    .select("designer_brand")
    .eq("user_id", project.owner_id)
    .maybeSingle();

  // Labels from the message catalogue directly (no next-intl in the worker).
  const m = getMessages(locale);

  const totals = [
    { label: m.proposal.subtotal, value: money(summary.subtotal_minor) },
    {
      label: `${profile.config.tax.name} @ ${(profile.config.tax.default_rate * 100).toFixed(0)}%`,
      value: money(summary.tax_minor),
    },
    { label: m.proposal.total, value: money(summary.total_minor) },
  ];

  const pdf = await renderProposalPdf({
    copy,
    projectName: project.name,
    designerBrand: profileRow?.designer_brand ?? null,
    marketName: profile.config.display_name,
    totals,
    disclaimer: m.advisory.disclaimer,
    labels: {
      investment: m.proposal.investment,
      nextSteps: m.proposal.nextSteps,
      valueEngineering: m.proposal.valueEngineering,
      preparedFor: m.proposal.preparedFor,
    },
  });

  const version = summary.version ?? 1;
  const storagePath = `${project.owner_id}/${projectId}/proposal-v${version}.pdf`;

  const { error: uploadError } = await svc.storage
    .from("proposals")
    .upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw new Error(`proposal job: upload: ${uploadError.message}`);

  await svc.from("proposals").delete().eq("project_id", projectId).eq("version", version);
  const { error: insertError } = await svc.from("proposals").insert({
    project_id: projectId,
    version,
    pdf_url: storagePath,
    copy,
  });
  if (insertError) throw new Error(`proposal job: persist: ${insertError.message}`);

  if (project.status === "boq") {
    await svc.from("projects").update({ status: "proposal" }).eq("id", projectId);
  }

  return { version, storage_path: storagePath };
};
