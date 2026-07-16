import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/**
 * Next 16 renamed the `middleware` file convention to `proxy`.
 *
 * Task 1: locale negotiation only.
 * Task 2 adds the auth gate (401 on unauthenticated `/api/*`) and Task 12's
 * white-label tenant lookup resolves off the `host` header here too.
 */
export default createMiddleware(routing);

export const config = {
  // Skip Next internals and static assets; match everything else.
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
