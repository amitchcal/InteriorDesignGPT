import type { Currency } from "@/types/market";

/**
 * Money formatting — the "edge" of CLAUDE.md non-negotiable #5.
 *
 * Money is integer minor units everywhere else (paise/cents). It becomes a
 * decimal string only here, driven by the market's currency. Nothing upstream
 * of this file should divide by 100.
 */

/**
 * Minor units per major unit, from the currency itself rather than a hardcoded
 * 100 — JPY has 0 decimals, KWD has 3. INR and USD have 2.
 */
function minorPerMajor(currencyCode: string, locale: string): number {
  const digits = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
  }).resolvedOptions().maximumFractionDigits;

  return 10 ** (digits ?? 2);
}

/**
 * Format minor units as the market's currency.
 *
 * Uses the market's locale, so `en-IN` gives lakh/crore grouping (₹18,00,000)
 * and `en-US` gives thousands (₹1,800,000) — which is exactly why the grouping
 * must come from the profile and not from a global default.
 */
export function formatMoney(
  minor: number,
  currency: Currency,
  locale: string,
): string {
  if (!Number.isInteger(minor)) {
    throw new Error(
      `formatMoney expects integer minor units, received ${minor}. ` +
        `Money must never be stored or passed as a float.`,
    );
  }

  const divisor = minorPerMajor(currency.code, locale);

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.code,
  }).format(minor / divisor);
}

/**
 * Major units -> minor, for user-entered amounts (e.g. a budget field).
 * Rounds: a user typing 1234.567 must not persist a fractional paisa.
 */
export function toMinor(
  major: number,
  currency: Currency,
  locale: string,
): number {
  return Math.round(major * minorPerMajor(currency.code, locale));
}
