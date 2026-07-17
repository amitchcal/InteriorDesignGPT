import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

type AuthedContext = { supabase: SupabaseClient; user: User };

/**
 * Resolves the signed-in user for a route handler.
 *
 * The proxy already rejects unauthenticated `/api/*` calls, but handlers call
 * this anyway: it hands back the user id, and it means a route is still safe if
 * the matcher ever changes. Defence in depth — the proxy is a gate, not a
 * guarantee.
 */
export async function getAuthedUser(): Promise<AuthedContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? { supabase, user } : null;
}
