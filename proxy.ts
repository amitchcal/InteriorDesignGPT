import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "./i18n/routing";
import { createProxyClient } from "./lib/supabase/proxy";

/**
 * Next 16 renamed the `middleware` file convention to `proxy`.
 *
 * Two distinct jobs, split by path:
 *   /api/*  — auth gate. Reject unauthenticated calls with `401 unauthorized`
 *             (Task 2). Never locale-negotiated: API routes have no locale, and
 *             running next-intl over them would redirect `/api/x` to
 *             `/en-IN/api/x`.
 *   others  — locale negotiation + auth cookie refresh.
 *
 * Task 12's white-label tenant lookup resolves off the `host` header here too.
 */
const intlMiddleware = createMiddleware(routing);

/** Endpoints that must stay reachable while signed out. */
const PUBLIC_API_ROUTES = ["/api/markets"];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api")) {
    const response = NextResponse.next({ request });
    const supabase = createProxyClient(request, response);

    // getUser() revalidates against the auth server. getSession() only decodes
    // the cookie, which the client could have forged — never gate on it.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && !PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r))) {
      // Shape must match lib/api/errors.ts — this bypasses the route handler.
      return NextResponse.json(
        { error: { code: "unauthorized", message: "Sign in to continue." } },
        { status: 401 },
      );
    }

    return response;
  }

  const response = intlMiddleware(request);
  const supabase = createProxyClient(request, response);
  await supabase.auth.getUser(); // refreshes the session cookie onto `response`

  return response;
}

export const config = {
  // Skip Next internals and static assets; match everything else incl. /api.
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
