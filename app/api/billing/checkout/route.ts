import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getAuthedUser } from "@/lib/api/auth";
import {
  apiError,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { getPlan, plans } from "@/lib/billing/plans";
import { getMarketProfile, MarketNotFoundError } from "@/lib/market";
import {
  PaymentProviderError,
  selectPaymentProvider,
} from "@/lib/providers/payment";

const bodySchema = z.object({
  plan: z.enum(plans),
  market_code: z.string().min(2),
});

/**
 * POST /api/billing/checkout — start a subscription checkout (E5-2).
 *
 * Contract: 200 { checkout_url }. The provider is chosen by market
 * (Razorpay for IN, Stripe otherwise) — never named in this route.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthedUser();
  if (!ctx) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation_error", "Expected a JSON body.");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const plan = getPlan(parsed.data.plan);
  if (!plan) return apiError("validation_error", "Unknown plan.", { plan: "unknown" });
  if (plan.free) {
    return apiError("validation_error", "That plan is free — no checkout needed.", {
      plan: "free",
    });
  }

  let market;
  try {
    market = await getMarketProfile(parsed.data.market_code);
  } catch (error) {
    if (error instanceof MarketNotFoundError) {
      return apiError("validation_error", "Not an active market.", {
        market_code: "unknown",
      });
    }
    return serverError();
  }

  if (plan.price_minor[market.config.currency.code] === undefined) {
    return apiError("validation_error", "That plan isn't sold in this market.", {
      plan: `no price in ${market.config.currency.code}`,
    });
  }

  const provider = selectPaymentProvider(parsed.data.market_code);
  const origin = request.nextUrl.origin;

  try {
    const { checkout_url } = await provider.checkout({
      plan,
      market: market.config,
      customerEmail: ctx.user.email ?? null,
      successUrl: `${origin}/billing/success?ref=${ctx.user.id}`,
      cancelUrl: `${origin}/billing`,
      // The webhook maps a completed payment back to this owner + plan.
      reference: `${ctx.user.id}:${plan.id}`,
    });
    return NextResponse.json({ checkout_url });
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      // Missing keys or a provider outage — surfaced as 502, page keeps working.
      return apiError(
        "provider_error",
        "We couldn't start checkout just now. Please try again.",
      );
    }
    return serverError();
  }
}
