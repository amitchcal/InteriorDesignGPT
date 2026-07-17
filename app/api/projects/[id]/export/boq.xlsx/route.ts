import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import { apiError, notFound, serverError, unauthorized } from "@/lib/api/errors";
import { getMarketProfile } from "@/lib/market";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id/export/boq.xlsx — the latest BOQ as a spreadsheet (E3-6).
 *
 * Money is written as a real number in major units with a currency number
 * format, not as a pre-formatted string: a designer opens this to edit and
 * re-total it, and a string in a money column breaks every formula they'd
 * write. The minor→major conversion is the only place a float is allowed, and
 * it happens at the edge, on the way out (non-negotiable #5).
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  const { data: project } = await ctx.supabase
    .from("projects")
    .select("id, name, market_code")
    .eq("id", id)
    .maybeSingle();
  if (!project) return notFound("that project");

  const { data: summary } = await ctx.supabase
    .from("boq_summaries")
    .select("version, subtotal_minor, tax_minor, total_minor, currency, budget_delta_minor")
    .eq("project_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!summary) {
    return apiError("not_found", "This project has no BOQ yet.");
  }

  const { data: items, error: itemsError } = await ctx.supabase
    .from("boq_items")
    .select("room, item_code, spec, qty, unit, rate_minor, amount_minor, tier")
    .eq("project_id", id)
    .eq("version", summary.version)
    .order("room");
  if (itemsError) return serverError();

  let profile;
  try {
    profile = await getMarketProfile(project.market_code);
  } catch {
    return serverError();
  }

  // Grouping and symbol come from the market's own locale/currency — the same
  // profile that drives the app (₹18,00,000.00 for IN, $1,800,000.00 for US).
  const { symbol } = profile.config.currency;
  const grouping = profile.config.locale === "en-IN" ? "##,##,##0.00" : "#,##0.00";
  const moneyFormat = `"${symbol}"${grouping}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Interior AI";
  wb.created = new Date();

  const ws = wb.addWorksheet("BOQ");
  ws.columns = [
    { header: "Room", key: "room", width: 20 },
    { header: "Item code", key: "item_code", width: 16 },
    { header: "Specification", key: "spec", width: 52 },
    { header: "Qty", key: "qty", width: 10 },
    { header: "Unit", key: "unit", width: 8 },
    { header: "Rate", key: "rate", width: 14 },
    { header: "Amount", key: "amount", width: 16 },
    { header: "Tier", key: "tier", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const item of items ?? []) {
    const row = ws.addRow({
      room: item.room,
      item_code: item.item_code ?? "",
      spec: item.spec,
      qty: Number(item.qty),
      unit: item.unit,
      rate: item.rate_minor / 100,
      amount: item.amount_minor / 100,
      tier: item.tier,
    });
    row.getCell("rate").numFmt = moneyFormat;
    row.getCell("amount").numFmt = moneyFormat;
  }

  ws.addRow({});
  const totals: [string, number][] = [
    ["Subtotal", summary.subtotal_minor / 100],
    [`${profile.config.tax.name} @ ${(profile.config.tax.default_rate * 100).toFixed(0)}%`, summary.tax_minor / 100],
    ["Total", summary.total_minor / 100],
  ];
  for (const [label, value] of totals) {
    const row = ws.addRow({ spec: label, amount: value });
    row.getCell("spec").font = { bold: true };
    row.getCell("amount").font = { bold: true };
    row.getCell("amount").numFmt = moneyFormat;
  }

  if (summary.budget_delta_minor !== null) {
    const over = summary.budget_delta_minor > 0;
    const row = ws.addRow({
      spec: over ? "Over budget by" : "Under budget by",
      amount: Math.abs(summary.budget_delta_minor) / 100,
    });
    row.getCell("amount").numFmt = moneyFormat;
    row.getCell("spec").font = { bold: true, color: { argb: over ? "FFB00020" : "FF097B4A" } };
    row.getCell("amount").font = { bold: true, color: { argb: over ? "FFB00020" : "FF097B4A" } };
  }

  ws.addRow({});
  // Non-negotiable #3: every BOQ output states that rates are directional.
  const disclaimer = ws.addRow({
    room:
      "Rates are directional estimates and need local verification. Working drawings require sign-off by a licensed professional.",
  });
  disclaimer.font = { italic: true, size: 9 };

  const buffer = await wb.xlsx.writeBuffer();
  const safeName = project.name.replace(/[^\w\-]+/g, "-").replace(/^-|-$/g, "");

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName || "boq"}-v${summary.version}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
