import type { Plan } from "@/lib/billing/plans";
import type { MarketConfig } from "@/types/market";

/**
 * Payment providers, behind a swappable interface (CLAUDE.md). The concrete
 * provider is chosen by `market_code` — Razorpay for IN, Stripe elsewhere — and
 * no vendor name appears in the route or business logic.
 *
 * Adding a market never touches this: the market's currency drives the price,
 * and the provider is selected from the code. Same rent-the-muscle shape as
 * RenderProvider.
 */

export interface PaymentProvider {
  readonly name: string;
  /** Creates a hosted checkout and returns its URL (api-contracts). */
  checkout(input: CheckoutInput): Promise<{ checkout_url: string }>;
}

export type CheckoutInput = {
  plan: Plan;
  market: MarketConfig;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Passed through so the webhook can map a payment back to a subscription. */
  reference: string;
};

export class PaymentProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new PaymentProviderError(`${name} is not configured.`);
  return v;
}

/**
 * Stripe Checkout via its REST API (form-encoded), so no SDK dependency — same
 * lightweight approach as the render adapter.
 */
class StripeProvider implements PaymentProvider {
  readonly name = "stripe";

  async checkout(input: CheckoutInput): Promise<{ checkout_url: string }> {
    const key = required("STRIPE_SECRET_KEY");
    const currency = input.market.currency.code.toLowerCase();
    const amount = input.plan.price_minor[input.market.currency.code];
    if (amount === undefined) {
      throw new PaymentProviderError(
        `Plan ${input.plan.id} has no price in ${input.market.currency.code}.`,
      );
    }

    const form = new URLSearchParams({
      mode: "subscription",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": `Interior AI — ${input.plan.id}`,
      client_reference_id: input.reference,
    });
    if (input.customerEmail) form.set("customer_email", input.customerEmail);

    let res: Response;
    try {
      res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
    } catch (error) {
      throw new PaymentProviderError("Stripe request failed.", error);
    }

    if (!res.ok) {
      throw new PaymentProviderError(`Stripe returned ${res.status}.`);
    }
    const body = (await res.json()) as { url?: string };
    if (!body.url) throw new PaymentProviderError("Stripe returned no URL.");
    return { checkout_url: body.url };
  }
}

/**
 * Razorpay Payment Links via REST (basic auth), for the IN market.
 */
class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay";

  async checkout(input: CheckoutInput): Promise<{ checkout_url: string }> {
    const keyId = required("RAZORPAY_KEY_ID");
    const keySecret = required("RAZORPAY_KEY_SECRET");
    const amount = input.plan.price_minor[input.market.currency.code];
    if (amount === undefined) {
      throw new PaymentProviderError(
        `Plan ${input.plan.id} has no price in ${input.market.currency.code}.`,
      );
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    let res: Response;
    try {
      res = await fetch("https://api.razorpay.com/v1/payment_links", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          currency: input.market.currency.code,
          description: `Interior AI — ${input.plan.id}`,
          reference_id: input.reference,
          callback_url: input.successUrl,
          callback_method: "get",
          ...(input.customerEmail && {
            customer: { email: input.customerEmail },
            notify: { email: true },
          }),
        }),
      });
    } catch (error) {
      throw new PaymentProviderError("Razorpay request failed.", error);
    }

    if (!res.ok) {
      throw new PaymentProviderError(`Razorpay returned ${res.status}.`);
    }
    const body = (await res.json()) as { short_url?: string };
    if (!body.short_url) throw new PaymentProviderError("Razorpay returned no URL.");
    return { checkout_url: body.short_url };
  }
}

const STRIPE = new StripeProvider();
const RAZORPAY = new RazorpayProvider();

/**
 * The routing rule (E5-2): IN → Razorpay, everyone else → Stripe. Pure and
 * synchronous so it's verifiable without live keys.
 */
export function selectPaymentProvider(marketCode: string): PaymentProvider {
  return marketCode === "IN" ? RAZORPAY : STRIPE;
}
