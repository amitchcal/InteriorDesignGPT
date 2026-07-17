import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";

/**
 * OAuth + magic-link landing point. Exchanges the code for a session, then
 * redirects into the locale-prefixed app.
 *
 * Not under /[locale] — providers redirect to one fixed callback URL, so the
 * locale rides along in `next` instead.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const locale = searchParams.get("locale") ?? routing.defaultLocale;
  const next = searchParams.get("next") ?? `/${locale}`;

  if (!code) {
    return NextResponse.redirect(`${origin}/${locale}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/${locale}/login?error=auth_failed`);
  }

  // Only ever redirect to a path on this origin — an open redirect here would
  // hand a freshly-minted session to whatever host an attacker put in `next`.
  const target = next.startsWith("/") ? next : `/${locale}`;
  return NextResponse.redirect(`${origin}${target}`);
}
