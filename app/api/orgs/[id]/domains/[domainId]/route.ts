import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/api/auth";
import { notFound, serverError, unauthorized } from "@/lib/api/errors";
import { DomainProviderError, selectDomainProvider } from "@/lib/providers/domains";

type RouteContext = { params: Promise<{ id: string; domainId: string }> };

/**
 * DELETE /api/orgs/:id/domains/:domainId — detach a custom domain. Owner only
 * (RLS). Best-effort provider removal; the DB row is the source of truth for
 * whether we resolve the tenant, so we delete it regardless.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  const { id, domainId } = await params;

  // RLS returns the row only to the org owner.
  const { data: row, error } = await ctx.supabase
    .from("org_domains")
    .select("id, hostname")
    .eq("id", domainId)
    .eq("org_id", id)
    .maybeSingle();

  if (error) return serverError();
  if (!row) return notFound("that domain");

  try {
    await selectDomainProvider().remove(row.hostname);
  } catch (e) {
    // Non-fatal: the registrar/provider may already have dropped it. Proceed to
    // remove our row so it stops resolving.
    if (!(e instanceof DomainProviderError)) return serverError();
  }

  const { error: delErr } = await ctx.supabase
    .from("org_domains")
    .delete()
    .eq("id", domainId)
    .eq("org_id", id);

  if (delErr) return serverError();

  return NextResponse.json({ ok: true });
}
