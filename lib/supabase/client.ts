import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";

/** Browser client — anon key only, RLS applies. */
export function createClient() {
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
