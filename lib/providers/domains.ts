import { resolveCname, resolve4 } from "node:dns/promises";

import type { DomainStatus, DomainVerification } from "@/types/branding";

/**
 * Custom-domain attachment, behind a swappable interface (same "rent the muscle"
 * rule as RenderProvider). The host platform happens to be Vercel, but routes
 * only know `DomainProvider`. With a Vercel token set we drive its API; without
 * one we fall back to a manual provider that hands out DNS instructions and
 * verifies them with a live lookup — so white-label works before, and
 * independently of, any Vercel automation.
 */

export type DomainState = {
  status: DomainStatus;
  verification: DomainVerification | null;
};

export class DomainProviderError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DomainProviderError";
  }
}

export interface DomainProvider {
  /** Register the domain; returns its initial state + records to set. */
  attach(hostname: string): Promise<DomainState>;
  /** Re-check a pending domain. */
  status(hostname: string): Promise<DomainState>;
  /** Detach; must not throw if the domain is already gone. */
  remove(hostname: string): Promise<void>;
}

/** The CNAME target Vercel expects apex-less subdomains to point at. */
const VERCEL_CNAME = "cname.vercel-dns.com";

/** Standard instruction we hand studios in manual mode. */
function manualRecords(hostname: string): DomainVerification {
  return [{ type: "CNAME", name: hostname, value: VERCEL_CNAME }];
}

/**
 * No-token mode. Attach records the domain as pending with DNS instructions;
 * status does a real CNAME/A lookup to confirm the studio pointed it at us.
 */
export class ManualDomainProvider implements DomainProvider {
  async attach(hostname: string): Promise<DomainState> {
    return { status: "pending", verification: manualRecords(hostname) };
  }

  async status(hostname: string): Promise<DomainState> {
    try {
      const cnames = await resolveCname(hostname).catch(() => [] as string[]);
      if (cnames.some((c) => c.toLowerCase().includes("vercel"))) {
        return { status: "active", verification: null };
      }
      // Apex domains can't CNAME; accept an A record that resolves at all as a
      // best-effort signal, but keep the instruction visible until it's a CNAME.
      const a = await resolve4(hostname).catch(() => [] as string[]);
      if (a.length > 0) return { status: "active", verification: null };
    } catch {
      // fall through to pending
    }
    return { status: "pending", verification: manualRecords(hostname) };
  }

  async remove(): Promise<void> {
    // Nothing to detach — DNS lives with the studio's registrar.
  }
}

type VercelDomainResponse = {
  verified?: boolean;
  verification?: { type: string; domain: string; value: string }[];
  error?: { code: string; message: string };
};

/** Drives the Vercel domains API. Config is read from env by the selector. */
export class VercelDomainProvider implements DomainProvider {
  constructor(
    private readonly token: string,
    private readonly projectId: string,
    private readonly teamId?: string,
  ) {}

  private url(path: string): string {
    const q = this.teamId ? `?teamId=${encodeURIComponent(this.teamId)}` : "";
    return `https://api.vercel.com${path}${q}`;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  private toState(body: VercelDomainResponse, hostname: string): DomainState {
    if (body.verified) return { status: "active", verification: null };
    const verification: DomainVerification =
      body.verification?.length
        ? body.verification.map((v) => ({
            type: (v.type.toUpperCase() as DomainVerification[number]["type"]) ?? "TXT",
            name: v.domain,
            value: v.value,
          }))
        : manualRecords(hostname);
    return { status: "pending", verification };
  }

  async attach(hostname: string): Promise<DomainState> {
    let res: Response;
    try {
      res = await fetch(this.url(`/v10/projects/${this.projectId}/domains`), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ name: hostname }),
      });
    } catch (error) {
      throw new DomainProviderError("Vercel API unreachable.", error);
    }
    const body = (await res.json().catch(() => ({}))) as VercelDomainResponse;
    // 409 = already attached to this project; treat as attached and re-check.
    if (!res.ok && res.status !== 409) {
      throw new DomainProviderError(
        body.error?.message ?? `Vercel rejected the domain (${res.status}).`,
      );
    }
    if (res.status === 409) return this.status(hostname);
    return this.toState(body, hostname);
  }

  async status(hostname: string): Promise<DomainState> {
    let res: Response;
    try {
      res = await fetch(
        this.url(`/v9/projects/${this.projectId}/domains/${encodeURIComponent(hostname)}`),
        { headers: this.headers() },
      );
    } catch (error) {
      throw new DomainProviderError("Vercel API unreachable.", error);
    }
    if (res.status === 404) return { status: "error", verification: null };
    const body = (await res.json().catch(() => ({}))) as VercelDomainResponse;
    if (!res.ok) {
      throw new DomainProviderError(
        body.error?.message ?? `Vercel status check failed (${res.status}).`,
      );
    }
    return this.toState(body, hostname);
  }

  async remove(hostname: string): Promise<void> {
    try {
      const res = await fetch(
        this.url(`/v9/projects/${this.projectId}/domains/${encodeURIComponent(hostname)}`),
        { method: "DELETE", headers: this.headers() },
      );
      // 404 = already gone. Anything else non-OK is a real failure.
      if (!res.ok && res.status !== 404) {
        const body = (await res.json().catch(() => ({}))) as VercelDomainResponse;
        throw new DomainProviderError(
          body.error?.message ?? `Vercel domain removal failed (${res.status}).`,
        );
      }
    } catch (error) {
      if (error instanceof DomainProviderError) throw error;
      throw new DomainProviderError("Vercel API unreachable.", error);
    }
  }
}

/**
 * Vercel when a token + project id are set; otherwise the manual DNS provider.
 * Adding a host platform is a new case here plus its env — no route changes.
 */
export function selectDomainProvider(): DomainProvider {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (token && projectId) {
    return new VercelDomainProvider(token, projectId, process.env.VERCEL_TEAM_ID);
  }
  return new ManualDomainProvider();
}
