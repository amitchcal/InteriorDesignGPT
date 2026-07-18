import { logoPublicUrl } from "@/lib/branding/resolve";
import type { Branding } from "@/types/branding";

/**
 * The white-label header strip. Rendered only for a resolved tenant (a custom
 * domain), so the stock app on the main domain is unchanged. Shows the studio's
 * logo and/or name — this is what makes the app read as *theirs* to their
 * clients.
 */
export function BrandBar({ branding }: { branding: Branding }) {
  if (!branding.org_id) return null;

  return (
    <header className="border-border flex items-center gap-3 border-b px-6 py-3">
      {branding.logo_path ? (
        // Tenant logo from a public bucket; next/image would need per-tenant remotePatterns.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoPublicUrl(branding.logo_path)}
          alt={branding.brand_name}
          className="h-8 w-auto max-w-[180px] object-contain"
        />
      ) : (
        <span className="text-lg font-semibold tracking-tight">
          {branding.brand_name}
        </span>
      )}
    </header>
  );
}
