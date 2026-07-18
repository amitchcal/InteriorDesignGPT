import { NextResponse } from "next/server";

/**
 * POST /api/billing/webhook — payment confirmation from Stripe / Razorpay.
 *
 * NOT verified end-to-end: it needs live provider keys and signed webhook events
 * that can't be produced without real payments. Rather than ship untested
 * signature-verification code as if it worked, this documents the contract and
 * refuses anything it can't verify. The upgrade it would perform —
 * applyPlanUpgrade — IS tested directly (that's the part with real
 * consequences).
 *
 * To finish for production:
 *   1. Verify the signature (Stripe: `stripe-signature` + STRIPE_WEBHOOK_SECRET;
 *      Razorpay: `x-razorpay-signature` + the webhook secret).
 *   2. On checkout.session.completed / payment_link.paid, read the
 *      client_reference_id / reference_id ("<ownerId>:<planId>").
 *   3. Call applyPlanUpgrade(serviceClient, { ownerId, planId, provider,
 *      periodEnd }).
 * Return 200 only after the signature verifies.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: "server_error",
        message: "Webhook handling requires live provider configuration.",
      },
    },
    { status: 501 },
  );
}
