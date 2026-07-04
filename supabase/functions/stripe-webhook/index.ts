// stripe-webhook — Stripe calls this; it is the ONLY writer of purchase
// status. Verifies the Stripe signature (no Supabase JWT — config.toml sets
// verify_jwt = false for this function), then records the one-time unlock
// into the subscriptions table that useSubscription() reads.
//
// One-time purchase model (2026-07 pivot): a completed $19.99 Checkout writes
// tier 'pro', status 'active', current_period_end = LIFETIME sentinel. "Did
// they ever buy?" is simply "does an unexpired pro row exist?" — the same
// read the client already does.
//
// Events handled:
//   checkout.session.completed (mode 'payment') → lifetime unlock
//
// Subscription lifecycle events are deliberately IGNORED: no paid
// subscriptions exist (verified 2026-07-03 — all 77 rows are comps), and
// ignoring them means cancelling the leftover BETA6 test subscription in
// Stripe cannot overwrite anyone's comp row.
//
// The user is identified by session.metadata.user_id (set by
// create-checkout-session), falling back to client_reference_id.
//
// Required secrets:
//   STRIPE_SECRET_KEY       same key as create-checkout-session
//   STRIPE_WEBHOOK_SECRET   whsec_... from the Stripe webhook endpoint
//
// Stripe Dashboard → Developers → Webhooks: the endpoint only needs the
// checkout.session.completed event now (extra subscribed events are ignored).

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// Far-future expiry meaning "forever". Matches the app's LIFETIME_AFTER_MS
// convention in constants/billing.ts (anything past ~2096 renders as
// lifetime). 4102444800000 = 2100-01-01 UTC.
const LIFETIME_EXPIRY_MS = 4_102_444_800_000;

function plain(status: number, body: string): Response {
  return new Response(body, { status });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return plain(405, "method not allowed");

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) return plain(500, "billing not configured");

  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    const signature = req.headers.get("stripe-signature") ?? "";
    const payload = await req.text();
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (e) {
    console.error("webhook signature verification failed", e);
    return plain(400, "bad signature");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Only act on the one-time unlock, and only once it's actually paid
        // (async payment methods complete later; card payments are 'paid'
        // here already).
        if (session.mode !== "payment" || session.payment_status !== "paid") break;
        const userId = session.metadata?.user_id ?? session.client_reference_id;
        if (!userId) {
          console.error("paid session without user_id", session.id);
          break;
        }
        const { error } = await admin.from("subscriptions").upsert({
          user_id: userId,
          tier: "pro",
          status: "active",
          stripe_customer_id:
            typeof session.customer === "string"
              ? session.customer
              : (session.customer?.id ?? null),
          current_period_end: LIFETIME_EXPIRY_MS,
          updated_at: Date.now(),
        });
        if (error) {
          console.error("subscriptions upsert failed", error);
          // Non-2xx makes Stripe retry — correct for transient DB errors.
          return plain(500, "internal error");
        }
        break;
      }
      default:
        // Subscription-era or unrequested event — acknowledge and ignore.
        break;
    }
    return plain(200, "ok");
  } catch (e) {
    console.error("webhook handling failed", e);
    return plain(500, "internal error");
  }
});
