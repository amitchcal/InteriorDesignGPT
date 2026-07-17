import { getTranslations } from "next-intl/server";
import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api/errors";
import { EngineError, EngineOutputError } from "@/lib/engines/client";
import { runProposalEngine } from "@/lib/engines/proposal";
import { getMarketProfile } from "@/lib/market";
import { formatMoney } from "@/lib/market/money";
import { renderProposalPdf } from "@/lib/pdf/proposal";
import { conceptSchema } from "@/types/concept";
import type { ValueEngineeringOption } from "@/types/boq";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/proposal — generate the client proposal PDF (E4-1).
 *
 * Contract: 201 { version, pdf_url }.
 *
 * The PDF lands in the private `proposals` bucket and `pdf_url` is a signed URL.
 * Buckets stay private (0004's own note): a proposal carries a client's budget
 * and a designer's rates, and a public URL is a permanent, unauthenticated leak
 * of both to anyone who guesses the path.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  const { data: project } = await ctx.supabase
    .from("projects")
    .select("id, name, market_code, intake, status")
    .eq("id", id)
    .maybeSingle();
  if (!project) return notFound("that project");

  const { data: latestConcept } = await ctx.supabase
    .from("design_concepts")
    .select("version, concept")
    .eq("project_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: summary } = await ctx.supabase
    .from("boq_summaries")
    .select("version, subtotal_minor, tax_minor, total_minor, budget_delta_minor, value_eng")
    .eq("project_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestConcept || !summary) {
    return apiError("validation_error", "Generate a concept and a BOQ first.", {
      ...(!latestConcept && { concept: "missing" }),
      ...(!summary && { boq: "missing" }),
    });
  }

  const concept = conceptSchema.safeParse(latestConcept.concept);
  if (!concept.success) return serverError();

  let profile;
  try {
    profile = await getMarketProfile(project.market_code);
  } catch {
    return serverError();
  }

  const { currency, locale } = profile.config;
  const money = (minor: number) => formatMoney(minor, currency, locale);

  const { data: itemCount } = await ctx.supabase
    .from("boq_items")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id)
    .eq("version", summary.version);

  const ve = (summary.value_eng ?? []) as ValueEngineeringOption[];
  const over = (summary.budget_delta_minor ?? 0) > 0;

  const t = await getTranslations({ locale, namespace: "proposal" });
  const tAdvisory = await getTranslations({ locale, namespace: "advisory" });

  let copy;
  try {
    copy = await runProposalEngine({
      market_profile: profile.config,
      intake: project.intake,
      concept: concept.data,
      boq: {
        // Pre-formatted: the engine quotes, it does not compute.
        total: money(summary.total_minor),
        subtotal: money(summary.subtotal_minor),
        tax: money(summary.tax_minor),
        tax_name: profile.config.tax.name,
        budget_status:
          summary.budget_delta_minor === null
            ? null
            : `${over ? "over" : "under"} budget by ${money(Math.abs(summary.budget_delta_minor))}`,
        item_count: itemCount?.length ?? 0,
        value_engineering: ve.map((o) => ({
          label: o.label,
          saving: money(Math.abs(o.delta_minor)),
          note: o.note,
        })),
      },
      designer_brand: null,
    });
  } catch (error) {
    if (error instanceof EngineOutputError) {
      return apiError(
        "provider_error",
        "The proposal came back in an unexpected shape. Please try again.",
      );
    }
    if (error instanceof EngineError) {
      return apiError(
        "provider_error",
        "We couldn't write the proposal just now. Please try again.",
      );
    }
    return serverError();
  }

  const { data: profileRow } = await ctx.supabase
    .from("profiles")
    .select("designer_brand")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  const totals: { label: string; value: string }[] = [
    { label: t("subtotal"), value: money(summary.subtotal_minor) },
    {
      label: `${profile.config.tax.name} @ ${(profile.config.tax.default_rate * 100).toFixed(0)}%`,
      value: money(summary.tax_minor),
    },
    { label: t("total"), value: money(summary.total_minor) },
  ];

  let pdf: Buffer;
  try {
    pdf = await renderProposalPdf({
      copy,
      projectName: project.name,
      designerBrand: profileRow?.designer_brand ?? null,
      marketName: profile.config.display_name,
      totals,
      // Canonical, not the model's: non-negotiable #3 is mandatory, and a
      // mandatory legal line cannot depend on a model remembering it.
      disclaimer: tAdvisory("disclaimer"),
      labels: {
        investment: t("investment"),
        nextSteps: t("nextSteps"),
        valueEngineering: t("valueEngineering"),
        preparedFor: t("preparedFor"),
      },
    });
  } catch (error) {
    console.error("[proposal] PDF render failed", error);
    return serverError();
  }

  const version = (summary.version ?? 1);
  // Storage policy authorizes on the leading path segment (0004).
  const storagePath = `${ctx.user.id}/${id}/proposal-v${version}.pdf`;

  const { error: uploadError } = await ctx.supabase.storage
    .from("proposals")
    .upload(storagePath, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) {
    console.error("[proposal] storage upload failed", uploadError);
    return serverError();
  }

  const { data: signed, error: signError } = await ctx.supabase.storage
    .from("proposals")
    .createSignedUrl(storagePath, 60 * 60);
  if (signError || !signed) return serverError();

  await ctx.supabase.from("proposals").delete().eq("project_id", id).eq("version", version);
  const { error: insertError } = await ctx.supabase.from("proposals").insert({
    project_id: id,
    version,
    // The storage path, not the signed URL: signed URLs expire, and a stored
    // expired link is worse than no link.
    pdf_url: storagePath,
    copy,
  });
  if (insertError) return serverError();

  if (project.status === "boq") {
    await ctx.supabase.from("projects").update({ status: "proposal" }).eq("id", id);
  }

  return NextResponse.json({ version, pdf_url: signed.signedUrl }, { status: 201 });
}
