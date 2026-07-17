import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";

/**
 * Supabase client bound to the proxy's request/response cookie pair.
 *
 * The response is mutated in place so refreshed auth cookies ride back to the
 * browser — server components can't set cookies, so this is the only place the
 * session gets refreshed.
 */
export function createProxyClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );
}
