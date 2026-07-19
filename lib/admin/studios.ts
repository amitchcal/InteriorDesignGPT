import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminStudio } from "@/types/admin";

/** user_id -> email, from the auth admin API (small-scale v1: one page). */
export async function emailIndex(admin: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of data?.users ?? []) if (u.email) map.set(u.id, u.email);
  return map;
}

/**
 * Every studio across the platform, shaped for the admin console. Uses the
 * service-role client (bypasses RLS) — callers MUST have passed the platform
 * admin guard first.
 */
export async function listStudios(admin: SupabaseClient): Promise<AdminStudio[]> {
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, owner_id, plan, status, created_at")
    .order("created_at", { ascending: false });

  const { data: members } = await admin.from("org_members").select("org_id");
  const counts = new Map<string, number>();
  for (const m of members ?? [])
    counts.set(m.org_id, (counts.get(m.org_id) ?? 0) + 1);

  const emails = await emailIndex(admin);

  return (orgs ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    owner_id: o.owner_id,
    owner_email: emails.get(o.owner_id) ?? null,
    plan: o.plan,
    status: o.status,
    member_count: counts.get(o.id) ?? 0,
    created_at: o.created_at,
  }));
}
