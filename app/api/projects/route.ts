import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { getMarketProfile, MarketNotFoundError } from "@/lib/market";
import { createProjectSchema } from "@/types/project";

/** GET /api/projects — the user's projects (RLS decides visibility). */
export async function GET() {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { data, error } = await ctx.supabase
    .from("projects")
    .select("id, name, market_code, status, org_id, created_at")
    .order("created_at", { ascending: false });

  if (error) return serverError();

  return NextResponse.json({ projects: data });
}

/**
 * POST /api/projects — create a project.
 *
 * Contract: { name, market_code, intake } -> 201 { id, status:"draft" }
 * Over quota -> 402.
 *
 * Quota check + insert happen inside create_project() so they're atomic; see
 * 0009 for why a route-level check would be racy.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { name, market_code, intake, org_id } = parsed.data;

  // The market must exist and be active before we store a project against it —
  // the FK would catch a bad code, but as a 500. This also gives us the profile
  // to validate the intake against.
  let profile;
  try {
    profile = await getMarketProfile(market_code);
  } catch (error) {
    if (error instanceof MarketNotFoundError) {
      return apiError(
        "validation_error",
        "Some details are missing or need a second look.",
        { market_code: "not an active market" },
      );
    }
    return serverError();
  }

  // Cultural overrides must name rules this market actually defines. A stray
  // key means the client is sending another market's rules — silently storing
  // it would mislead the Task 6 gate.
  const knownRules = new Set(profile.config.cultural_rules.map((r) => r.id));
  const unknown = Object.keys(intake.cultural_overrides).filter(
    (id) => !knownRules.has(id),
  );
  if (unknown.length) {
    return apiError(
      "validation_error",
      "Some details are missing or need a second look.",
      { cultural_overrides: `not a rule in ${market_code}: ${unknown.join(", ")}` },
    );
  }

  // Ceiling height unit must match the market's system.
  const expectedUnit = profile.config.units === "metric" ? "m" : "ft";
  if (intake.client_brief.ceiling_height_unit !== expectedUnit) {
    return apiError(
      "validation_error",
      "Some details are missing or need a second look.",
      {
        "client_brief.ceiling_height_unit": `${market_code} uses ${expectedUnit}`,
      },
    );
  }

  const { data, error } = await ctx.supabase.rpc("create_project", {
    p_name: name,
    p_market_code: market_code,
    p_intake: intake,
    p_org_id: org_id ?? null,
  });

  if (error) {
    // Raised by create_project() — see 0009.
    if (error.message.includes("quota_exceeded")) {
      return apiError(
        "quota_exceeded",
        "You've used every project on your plan. Upgrade to add more.",
      );
    }
    if (error.message.includes("forbidden_org")) {
      return apiError("validation_error", "You're not a member of that organization.", {
        org_id: "not a member",
      });
    }
    if (error.message.includes("no_subscription")) return serverError();
    return serverError();
  }

  const project = Array.isArray(data) ? data[0] : data;

  return NextResponse.json(
    { id: project.id, status: project.status },
    { status: 201 },
  );
}
