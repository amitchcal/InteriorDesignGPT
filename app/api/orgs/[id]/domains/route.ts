import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  notFound,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { DomainProviderError, selectDomainProvider } from "@/lib/providers/domains";
import { addDomainSchema } from "@/types/branding";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/orgs/:id/domains — the org's custom domains. Owner only (RLS). */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  const { data, error } = await ctx.supabase
    .from("org_domains")
    .select("id, org_id, hostname, status, verification, created_at")
    .eq("org_id", id)
    .order("created_at", { ascending: false });

  if (error) return serverError();

  return NextResponse.json({ domains: data });
}

/**
 * POST /api/orgs/:id/domains — attach a custom domain.
 * Flow: verify org ownership (via an RLS-checked insert), then ask the provider
 * to register it and persist the returned status + DNS records.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = addDomainSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const { hostname } = parsed.data;

  // Insert first (pending). RLS (org_domains_write) rejects a non-owner, and the
  // UNIQUE(hostname) constraint rejects a domain already claimed elsewhere —
  // both before we call the external provider.
  const { data: row, error: insErr } = await ctx.supabase
    .from("org_domains")
    .insert({ org_id: id, hostname, status: "pending" })
    .select("id, org_id, hostname, status, verification, created_at")
    .single();

  if (insErr) {
    if (insErr.code === "42501" || insErr.code === "PGRST116") {
      return notFound("that organization");
    }
    if (insErr.code === "23505") {
      return apiError("validation_error", "That domain is already in use.", {
        hostname: "already in use",
      });
    }
    return serverError();
  }

  // Register with the host platform (Vercel or manual). A provider failure isn't
  // fatal — the row exists as pending; the owner can re-verify.
  let state;
  try {
    state = await selectDomainProvider().attach(hostname);
  } catch (error) {
    if (error instanceof DomainProviderError) {
      return NextResponse.json({ ...row, status: "pending" }, { status: 201 });
    }
    return serverError();
  }

  const { data: updated, error: updErr } = await ctx.supabase
    .from("org_domains")
    .update({ status: state.status, verification: state.verification })
    .eq("id", row.id)
    .select("id, org_id, hostname, status, verification, created_at")
    .single();

  if (updErr) return NextResponse.json(row, { status: 201 });

  return NextResponse.json(updated, { status: 201 });
}
