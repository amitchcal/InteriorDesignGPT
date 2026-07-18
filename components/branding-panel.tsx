"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { OrgDomain } from "@/types/branding";

export type OrgBranding = {
  id: string;
  name: string;
  brand_name: string | null;
  logo_path: string | null;
  primary_color: string | null;
  accent_color: string | null;
};

export function BrandingPanel({
  org,
  initialDomains,
}: {
  org: OrgBranding;
  initialDomains: OrgDomain[];
}) {
  const t = useTranslations("branding");
  const router = useRouter();

  const [brandName, setBrandName] = useState(org.brand_name ?? "");
  const [primary, setPrimary] = useState(org.primary_color ?? "#4f46e5");
  const [accent, setAccent] = useState(org.accent_color ?? "#f59e0b");
  const [logoPath, setLogoPath] = useState<string | null>(org.logo_path);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function uploadLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    const ext = (file.name.split(".").pop() ?? "png").replace(/[^\w]/g, "");
    const path = `${org.id}/logo-${Date.now()}.${ext}`;
    const supabase = createClient();
    const { error } = await supabase.storage
      .from("brand-assets")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (error) {
      setErr(t("logoFailed"));
      return;
    }
    setLogoPath(path);
    setMsg(t("logoReady"));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    const res = await fetch(`/api/orgs/${org.id}/branding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand_name: brandName.trim() || null,
        logo_path: logoPath,
        primary_color: primary,
        accent_color: accent,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setErr(t("saveFailed"));
      return;
    }
    setMsg(t("saved"));
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-6 rounded-xl border p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">{org.name}</h2>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t("brandNameLabel")}</span>
        <input
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          placeholder={org.name}
          maxLength={80}
          className="border-input bg-background rounded-md border px-3 py-2"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <ColorField
          label={t("primaryLabel")}
          value={primary}
          onChange={setPrimary}
        />
        <ColorField label={t("accentLabel")} value={accent} onChange={setAccent} />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t("logoLabel")}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onChange={uploadLogo}
          className="text-sm"
        />
        {logoPath && (
          <span className="text-muted-foreground text-xs">{t("logoSet")}</span>
        )}
      </label>

      {err && (
        <p role="alert" className="text-destructive text-sm">
          {err}
        </p>
      )}
      {msg && <p className="text-sm text-emerald-700 dark:text-emerald-500">{msg}</p>}

      <Button className="self-start" disabled={saving} onClick={save}>
        {saving ? t("saving") : t("saveCta")}
      </Button>

      <DomainsSubPanel orgId={org.id} initialDomains={initialDomains} />
    </section>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded-md border"
          aria-label={label}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-input bg-background w-28 rounded-md border px-2 py-2 font-mono text-xs"
        />
      </span>
    </label>
  );
}

function DomainsSubPanel({
  orgId,
  initialDomains,
}: {
  orgId: string;
  initialDomains: OrgDomain[];
}) {
  const t = useTranslations("branding");
  const [domains, setDomains] = useState<OrgDomain[]>(initialDomains);
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    if (!host.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/orgs/${orgId}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostname: host.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setErr(body?.error?.message ?? t("domainFailed"));
      return;
    }
    const created = (await res.json()) as OrgDomain;
    setDomains((d) => [created, ...d]);
    setHost("");
  }

  async function verify(id: string) {
    setBusy(true);
    const res = await fetch(`/api/orgs/${orgId}/domains/${id}/verify`, {
      method: "POST",
    });
    setBusy(false);
    if (res.ok) {
      const updated = (await res.json()) as OrgDomain;
      setDomains((d) => d.map((x) => (x.id === id ? updated : x)));
    }
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await fetch(`/api/orgs/${orgId}/domains/${id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (res.ok) setDomains((d) => d.filter((x) => x.id !== id));
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-5">
      <h3 className="font-medium">{t("domainsTitle")}</h3>
      <p className="text-muted-foreground text-xs text-pretty">{t("domainsHint")}</p>

      <div className="flex gap-2">
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="studio.example.com"
          className="border-input bg-background flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <Button variant="outline" disabled={busy || !host.trim()} onClick={add}>
          {t("addDomain")}
        </Button>
      </div>
      {err && (
        <p role="alert" className="text-destructive text-sm">
          {err}
        </p>
      )}

      {domains.length > 0 && (
        <ul className="flex flex-col gap-3">
          {domains.map((d) => (
            <li key={d.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono">{d.hostname}</span>
                <span
                  className={
                    d.status === "active"
                      ? "text-xs text-emerald-700 dark:text-emerald-500"
                      : d.status === "error"
                        ? "text-destructive text-xs"
                        : "text-muted-foreground text-xs"
                  }
                >
                  {t(`status_${d.status}`)}
                </span>
              </div>

              {d.status !== "active" && d.verification && d.verification.length > 0 && (
                <div className="text-muted-foreground mt-2 flex flex-col gap-1 text-xs">
                  <span>{t("dnsHint")}</span>
                  {d.verification.map((v, i) => (
                    <code key={i} className="bg-muted rounded px-2 py-1">
                      {v.type} {v.name} → {v.value}
                    </code>
                  ))}
                </div>
              )}

              <div className="mt-2 flex gap-3">
                {d.status !== "active" && (
                  <button
                    className="underline underline-offset-4"
                    disabled={busy}
                    onClick={() => verify(d.id)}
                  >
                    {t("verify")}
                  </button>
                )}
                <button
                  className="text-destructive underline underline-offset-4"
                  disabled={busy}
                  onClick={() => remove(d.id)}
                >
                  {t("remove")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
