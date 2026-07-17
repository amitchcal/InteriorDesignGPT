import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  notFound,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { getMarketProfile } from "@/lib/market";
import { toMinor } from "@/lib/market/money";
import { intakeSchema } from "@/types/project";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

const patchSchema = z
  .object({
    /** Major units, as the designer types it — converted at the edge. */
    rate: z.number().nonnegative().optional(),
    spec: z.string().trim().min(1).max(500).optional(),
  })
  .refine((v) => v.rate !== undefined || v.spec !== undefined, {
    message: "nothing to change",
  });

/**
 * PATCH /api/projects/:id/boq/items/:itemId — edit a line's rate or spec so the
 * BOQ matches the designer's real vendors (E3-5).
 *
 * The line amount and every total are recomputed here from the stored
 * quantities. The client sends a rate, never a total: a total that arrives from
 * a browser is a number nobody computed, and this is the figure a client is
 * quoted.
 *
 * Not in api-contracts — E3-5 is a scheduled Should with no endpoint specified.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id, itemId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { data: project } = await ctx.supabase
    .from("projects")
    .select("id, market_code, intake")
    .eq("id", id)
    .maybeSingle();
  if (!project) return notFound("that project");

  const { data: item } = await ctx.supabase
    .from("boq_items")
    .select("id, version, qty")
    .eq("id", itemId)
    .eq("project_id", id)
    .maybeSingle();
  if (!item) return notFound("that line item");

  let profile;
  try {
    profile = await getMarketProfile(project.market_code);
  } catch {
    return serverError();
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.spec !== undefined) update.spec = parsed.data.spec;

  if (parsed.data.rate !== undefined) {
    const rate_minor = toMinor(
      parsed.data.rate,
      profile.config.currency,
      profile.config.locale,
    );
    update.rate_minor = rate_minor;
    update.amount_minor = Math.round(Number(item.qty) * rate_minor);
  }

  const { error: updateError } = await ctx.supabase
    .from("boq_items")
    .update(update)
    .eq("id", itemId);
  if (updateError) return serverError();

  // Re-total from the stored lines. Same arithmetic as the engine path — the
  // summary must never be a stale snapshot of a BOQ that has since changed.
  const { data: lines, error: linesError } = await ctx.supabase
    .from("boq_items")
    .select("amount_minor")
    .eq("project_id", id)
    .eq("version", item.version);
  if (linesError || !lines) return serverError();

  const subtotal_minor = lines.reduce((sum, l) => sum + l.amount_minor, 0);
  const tax_minor = Math.round(subtotal_minor * profile.config.tax.default_rate);
  const total_minor = subtotal_minor + tax_minor;

  const intake = intakeSchema.safeParse(project.intake);
  const budget_delta_minor = intake.success
    ? total_minor - intake.data.client_brief.budget_total_minor
    : null;

  const { error: summaryError } = await ctx.supabase
    .from("boq_summaries")
    .update({ subtotal_minor, tax_minor, total_minor, budget_delta_minor })
    .eq("project_id", id)
    .eq("version", item.version);
  if (summaryError) return serverError();

  return NextResponse.json({
    ok: true,
    summary: {
      subtotal_minor,
      tax_minor,
      total_minor,
      currency: profile.config.currency.code,
      budget_delta_minor,
    },
  });
}
