import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api/errors";
import { costBoq } from "@/lib/boq/cost";
import { EngineError, EngineOutputError } from "@/lib/engines/client";
import { runBoqEngine } from "@/lib/engines/boq";
import { getMarketProfile, getRates } from "@/lib/market";
import { conceptSchema } from "@/types/concept";
import { intakeSchema } from "@/types/project";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/boq — run the BOQ engine over the latest concept
 * (E3-1..E3-4).
 *
 * Contract: 201 { version, summary: { total_minor, currency, budget_delta_minor,
 * value_engineering }, item_count }.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  const { data: project } = await ctx.supabase
    .from("projects")
    .select("id, market_code, intake, status")
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

  if (!latestConcept) {
    return apiError("validation_error", "Generate a concept first.", {
      concept: "no concept for this project yet",
    });
  }

  const concept = conceptSchema.safeParse(latestConcept.concept);
  if (!concept.success) return serverError();

  const intake = intakeSchema.safeParse(project.intake);
  if (!intake.success) {
    return apiError("validation_error", "This project's brief can't be read.");
  }

  const { data: rooms, error: roomsError } = await ctx.supabase
    .from("rooms")
    .select("name, length, width, ceiling_ht, unit, meta")
    .eq("project_id", id);
  if (roomsError) return serverError();

  let profile;
  let rates;
  try {
    profile = await getMarketProfile(project.market_code);
    // The market's whole library, not just the project's tier: the prompt may
    // legitimately reach for another tier's item, and value engineering has to
    // be able to price a cheaper one.
    rates = await getRates(project.market_code);
  } catch {
    return serverError();
  }

  if (rates.length === 0) {
    return apiError("provider_error", "No rates are published for this market.");
  }

  let output;
  try {
    output = await runBoqEngine({
      market_profile: profile.config,
      intake: {
        floor_plan: rooms ?? [],
        client_brief: intake.data.client_brief,
        preferences: intake.data.preferences,
        cultural_overrides: intake.data.cultural_overrides,
      },
      concept: concept.data,
      rate_library: rates,
    });
  } catch (error) {
    if (error instanceof EngineOutputError) {
      return apiError(
        "provider_error",
        "The BOQ came back in an unexpected shape. Please try again.",
      );
    }
    if (error instanceof EngineError) {
      return apiError(
        "provider_error",
        "We couldn't cost this project just now. Please try again.",
      );
    }
    return serverError();
  }

  // Arithmetic and rates are recomputed here — see lib/boq/cost.ts.
  const costed = costBoq({
    output,
    rates,
    taxRate: profile.config.tax.default_rate,
    budgetTotalMinor: intake.data.client_brief.budget_total_minor,
  });

  if (costed.arithmetic_drift.length) {
    console.warn("[boq] model arithmetic disagreed with computed", {
      project: id,
      drift: costed.arithmetic_drift,
    });
  }
  if (costed.rate_corrections.length) {
    console.warn("[boq] model rates disagreed with the rate library", {
      project: id,
      corrections: costed.rate_corrections,
    });
  }
  if (costed.unknown_item_codes.length) {
    console.warn("[boq] item codes not in this market's library", {
      project: id,
      codes: costed.unknown_item_codes,
    });
  }

  const overBudget = (costed.budget_delta_minor ?? 0) > 0;
  // The prompt returns value engineering only when over budget; enforce it so a
  // model that volunteers options under budget can't confuse the UI.
  const value_engineering = overBudget ? output.value_engineering : [];

  const version = (latestConcept.version ?? 1);

  // Replace any previous run at this version — a re-cost of the same concept is
  // a correction, not a new version. Versions track the concept, so the BOQ and
  // the concept it prices can never drift apart.
  await ctx.supabase.from("boq_items").delete().eq("project_id", id).eq("version", version);
  await ctx.supabase.from("boq_summaries").delete().eq("project_id", id).eq("version", version);

  const { error: itemsError } = await ctx.supabase.from("boq_items").insert(
    costed.items.map((item) => ({
      project_id: id,
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
  if (itemsError) return serverError();

  const { error: summaryError } = await ctx.supabase.from("boq_summaries").insert({
    project_id: id,
    version,
    subtotal_minor: costed.subtotal_minor,
    tax_minor: costed.tax_minor,
    total_minor: costed.total_minor,
    currency: profile.config.currency.code,
    budget_delta_minor: costed.budget_delta_minor,
    value_eng: value_engineering,
  });
  if (summaryError) return serverError();

  if (project.status === "concept") {
    await ctx.supabase.from("projects").update({ status: "boq" }).eq("id", id);
  }

  return NextResponse.json(
    {
      version,
      summary: {
        subtotal_minor: costed.subtotal_minor,
        tax_minor: costed.tax_minor,
        total_minor: costed.total_minor,
        currency: profile.config.currency.code,
        budget_delta_minor: costed.budget_delta_minor,
        value_engineering,
      },
      item_count: costed.items.length,
      assumptions: output.assumptions,
    },
    { status: 201 },
  );
}
