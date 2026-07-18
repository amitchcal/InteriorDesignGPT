import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isHexColor, luminance, readableForeground } from "@/lib/branding/contrast";
import { brandingCssVars } from "@/lib/branding/resolve";
import {
  addDomainSchema,
  brandingSchema,
  DEFAULT_BRANDING,
  hexColor,
  type Branding,
} from "@/types/branding";
import {
  ManualDomainProvider,
  VercelDomainProvider,
  selectDomainProvider,
} from "@/lib/providers/domains";

describe("contrast", () => {
  it("accepts #RGB and #RRGGBB, rejects the rest", () => {
    expect(isHexColor("#fff")).toBe(true);
    expect(isHexColor("#4F46E5")).toBe(true);
    expect(isHexColor("4F46E5")).toBe(false);
    expect(isHexColor("rgb(0,0,0)")).toBe(false);
    expect(isHexColor("#12")).toBe(false);
  });

  it("black sits on light brand colours, white on dark", () => {
    expect(readableForeground("#ffffff")).toBe("#000000");
    expect(readableForeground("#f59e0b")).toBe("#000000"); // amber → dark text
    expect(readableForeground("#000000")).toBe("#ffffff");
    expect(readableForeground("#4f46e5")).toBe("#ffffff"); // indigo → light text
  });

  it("luminance is ordered black < mid < white", () => {
    expect(luminance("#000000")).toBeLessThan(luminance("#808080"));
    expect(luminance("#808080")).toBeLessThan(luminance("#ffffff"));
  });
});

describe("branding schema", () => {
  it("rejects a non-hex colour", () => {
    expect(hexColor.safeParse("indigo").success).toBe(false);
    expect(brandingSchema.safeParse({ primary_color: "blue" }).success).toBe(false);
  });

  it("accepts a valid partial update and null to clear", () => {
    expect(
      brandingSchema.safeParse({ brand_name: "Studio Sharma", primary_color: "#4F46E5" })
        .success,
    ).toBe(true);
    expect(brandingSchema.safeParse({ logo_path: null }).success).toBe(true);
  });

  it("rejects an over-long brand name", () => {
    expect(brandingSchema.safeParse({ brand_name: "x".repeat(81) }).success).toBe(false);
  });
});

describe("domain schema", () => {
  it("accepts a bare hostname, lower-cased", () => {
    const parsed = addDomainSchema.parse({ hostname: "Studio.Example.COM" });
    expect(parsed.hostname).toBe("studio.example.com");
  });

  it("rejects a scheme, path, port, or single label", () => {
    for (const bad of [
      "https://studio.example.com",
      "studio.example.com/app",
      "studio.example.com:443",
      "localhost",
      "space in.com",
    ]) {
      expect(addDomainSchema.safeParse({ hostname: bad }).success).toBe(false);
    }
  });
});

describe("brandingCssVars", () => {
  it("emits nothing for the default (unbranded) tenant", () => {
    expect(brandingCssVars(DEFAULT_BRANDING)).toBe("");
  });

  it("emits primary vars + a computed foreground for a valid colour", () => {
    const b: Branding = { ...DEFAULT_BRANDING, primary_color: "#4f46e5" };
    const css = brandingCssVars(b);
    expect(css).toContain("--primary: #4f46e5;");
    expect(css).toContain("--primary-foreground: #ffffff;");
  });

  it("ignores a malformed stored colour rather than emitting broken CSS", () => {
    const b: Branding = { ...DEFAULT_BRANDING, primary_color: "not-a-color" };
    expect(brandingCssVars(b)).toBe("");
  });
});

describe("selectDomainProvider", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_PROJECT_ID;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("falls back to the manual provider when Vercel env is unset", () => {
    expect(selectDomainProvider()).toBeInstanceOf(ManualDomainProvider);
  });

  it("uses the Vercel provider when token + project id are set", () => {
    process.env.VERCEL_TOKEN = "tok";
    process.env.VERCEL_PROJECT_ID = "prj";
    expect(selectDomainProvider()).toBeInstanceOf(VercelDomainProvider);
  });
});

describe("ManualDomainProvider", () => {
  it("attach returns pending with a CNAME instruction", async () => {
    const state = await new ManualDomainProvider().attach("studio.example.com");
    expect(state.status).toBe("pending");
    expect(state.verification?.[0]).toMatchObject({
      type: "CNAME",
      name: "studio.example.com",
    });
  });
});
