import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import { notFound, serverError, unauthorized } from "@/lib/api/errors";
import { DomainProviderError, selectDomainProvider } from "@/lib/providers/domains";

type RouteContext = { params: Promise<{ id: string; domainId: string }> };

/**
 * POST /api/orgs/:id/domains/:domainId/verify — re-check DNS with the provider
 * and persist the result. A domain only starts resolving (status 'active') once
 * this confirms it. Owner only (RLS).
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id, domainId } = await params;

  const { data: row, error } = await ctx.supabase
    .from("org_domains")
    .select("id, hostname")
    .eq("id", domainId)
    .eq("org_id", id)
    .maybeSingle();

  if (error) return serverError();
  if (!row) return notFound("that domain");

  let state;
  try {
    state = await selectDomainProvider().status(row.hostname);
  } catch (e) {
    if (e instanceof DomainProviderError) {
      return NextResponse.json(
        { error: { code: "provider_error", message: e.message } },
        { status: 502 },
      );
    }
    return serverError();
  }

  const { data: updated, error: updErr } = await ctx.supabase
    .from("org_domains")
    .update({ status: state.status, verification: state.verification })
    .eq("id", domainId)
    .eq("org_id", id)
    .select("id, org_id, hostname, status, verification, created_at")
    .single();

  if (updErr) return serverError();

  return NextResponse.json(updated);
}
