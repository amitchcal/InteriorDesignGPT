import { z } from "zod";

/**
 * White-label branding for an organization. Every field is optional — an org
 * with nothing set renders the app default (DEFAULT_BRANDING).
 */

/** #RGB or #RRGGBB, case-insensitive. */
export const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a hex colour like #4F46E5");

/** PATCH /api/orgs/:id/branding body. All fields optional; null clears one. */
export const brandingSchema = z.object({
  brand_name: z.string().trim().min(1).max(80).nullish(),
  logo_path: z.string().trim().min(1).max(300).nullish(),
  primary_color: hexColor.nullish(),
  accent_color: hexColor.nullish(),
});

export type BrandingInput = z.infer<typeof brandingSchema>;

/** The resolved branding the UI renders (org_id present => a real tenant). */
export type Branding = {
  org_id: string | null;
  brand_name: string;
  logo_path: string | null;
  primary_color: string | null;
  accent_color: string | null;
};

export const DEFAULT_BRANDING: Branding = {
  org_id: null,
  brand_name: "InteriorDesignGPT",
  logo_path: null,
  primary_color: null,
  accent_color: null,
};

/**
 * A custom domain. Accept a bare hostname only — no scheme, port, path, or
 * wildcard. Lower-cased so it matches the DB's `lower(hostname)` constraint.
 */
export const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .regex(
    /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/,
    "enter a bare domain like studio.example.com",
  );

export const addDomainSchema = z.object({ hostname });

export type DomainStatus = "pending" | "active" | "error";

export type OrgDomain = {
  id: string;
  org_id: string;
  hostname: string;
  status: DomainStatus;
  verification: DomainVerification | null;
  created_at: string;
};

/** DNS records the owner must set for the domain to verify. */
export type DomainVerification = {
  type: "CNAME" | "A" | "TXT";
  name: string;
  value: string;
}[];
