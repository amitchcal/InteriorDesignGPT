import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The platform-admin gate. This is the ENTIRE security boundary for the operator
 * back-office, so every admin route and page must call it first and bail if it
 * returns null.
 *
 * It verifies admin status in the CALLER's own auth context — `is_platform_admin()`
 * (0017) resolves `auth.uid()` from the request's session — and only then hands
 * back a service-role client for the cross-tenant work the console needs. The
 * service client is never constructed unless the caller is a confirmed admin.
 */
export type AdminContext = { user: User; admin: SupabaseClient };

export async function requirePlatformAdmin(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Checked as the user (RLS/JWT context), not the service role — a forged
  // request can't spoof this.
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) return null;

  return { user, admin: createServiceClient() };
}
