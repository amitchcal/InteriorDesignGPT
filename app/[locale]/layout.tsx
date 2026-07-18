import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";
import { BrandBar } from "@/components/brand-bar";
import { brandingCssVars, getRequestBranding } from "@/lib/branding/resolve";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  const branding = await getRequestBranding();

  // On a white-label domain the tab reads as the studio's brand, not ours.
  const title = branding.org_id ? branding.brand_name : t("name");

  return { title, description: t("tagline") };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  const branding = await getRequestBranding();
  const cssVars = brandingCssVars(branding);

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {cssVars && (
        // Tenant colour overrides. Injected server-side so there's no
        // unbranded flash; only validated hex reaches here (brandingCssVars).
        <head>
          <style>{`:root{${cssVars}}`}</style>
        </head>
      )}
      <body className="min-h-full flex flex-col">
        <BrandBar branding={branding} />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
