import { cache } from "react";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { DEFAULT_BRANDING, type Branding } from "@/types/branding";
import { isHexColor, readableForeground } from "./contrast";

/**
 * Resolve the tenant for the current request from its Host header, via the
 * `resolve_tenant` RPC (0016). The RPC is security-definer and anon-callable, so
 * this works before the visitor authenticates — the whole point of a
 * client-facing white-label domain.
 *
 * `cache()` dedupes the lookup within a request (layout + metadata both call it).
 * On the main app domain no row matches and we return DEFAULT_BRANDING.
 */
export const getRequestBranding = cache(async (): Promise<Branding> => {
  const host = (await headers()).get("host");
  if (!host) return DEFAULT_BRANDING;

  // Strip the port so localhost:3000 / preview hosts resolve by name.
  const hostname = host.split(":")[0].toLowerCase();

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("resolve_tenant", { host: hostname })
    .maybeSingle<{
      org_id: string;
      brand_name: string;
      logo_path: string | null;
      primary_color: string | null;
      accent_color: string | null;
    }>();

  if (error || !data) return DEFAULT_BRANDING;

  return {
    org_id: data.org_id,
    brand_name: data.brand_name || DEFAULT_BRANDING.brand_name,
    logo_path: data.logo_path,
    primary_color: data.primary_color,
    accent_color: data.accent_color,
  };
});

/** Public URL for a logo stored in the public `brand-assets` bucket. */
export function logoPublicUrl(path: string): string {
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/brand-assets/${path}`;
}

/**
 * CSS custom-property overrides for a tenant's colours, or "" for the default
 * (no <style> injected, app looks stock). Only valid hex passes through — a
 * malformed stored value is ignored rather than emitting broken CSS. The value
 * is a plain declaration list; the caller wraps it in `:root { ... }`.
 */
export function brandingCssVars(branding: Branding): string {
  const decls: string[] = [];

  if (branding.primary_color && isHexColor(branding.primary_color)) {
    decls.push(`--primary: ${branding.primary_color};`);
    decls.push(`--primary-foreground: ${readableForeground(branding.primary_color)};`);
    decls.push(`--ring: ${branding.primary_color};`);
    decls.push(`--sidebar-primary: ${branding.primary_color};`);
  }
  if (branding.accent_color && isHexColor(branding.accent_color)) {
    decls.push(`--accent: ${branding.accent_color};`);
    decls.push(`--accent-foreground: ${readableForeground(branding.accent_color)};`);
  }

  return decls.join(" ");
}
