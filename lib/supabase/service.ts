import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env";

/**
 * Service-role client — **bypasses RLS**. Server-only.
 *
 * Per CLAUDE.md non-negotiable #2, this is the only way reference tables
 * (`market_profiles`, `rate_libraries`) are written. Never import this from
 * anything that reaches the browser, and never use it to serve user data
 * without an explicit ownership check.
 */
export function createServiceClient() {
  return createSupabaseClient(
    serverEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
