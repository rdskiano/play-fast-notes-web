// stripe-webhook — Stripe calls this; it is the ONLY writer of subscription
// status. Verifies the Stripe signature (no Supabase JWT — config.toml sets
// verify_jwt = false for this function), then mirrors the subscription into
// the subscriptions table that useSubscription() reads.
//
// Events handled:
//   checkout.session.completed                → mark the user's sub active
//   customer.subscription.updated / .deleted  → keep status + period end true
//
// The user is identified by metadata.user_id (set on the subscription by
// create-checkout-session), falling back to client_reference_id.
//
// Required secrets:
//   STRIPE_SECRET_KEY       same key as create-checkout-session
//   STRIPE_WEBHOOK_SECRET   whsec_... from the Stripe webhook endpoint
//
// Stripe Dashboard → Developers → Webhooks → Add endpoint:
//   https://uugodzwxuxgfwujnwpuq.supabase.co/functions/v1/stripe-webhook
//   events: checkout.session.completed, customer.subscription.updated,
//           customer.subscription.deleted

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

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

  async function upsertFromSubscription(sub: Stripe.Subscription) {
    const userId = sub.metadata?.user_id;
    if (!userId) {
      console.error("subscription without user_id metadata", sub.id);
      return;
    }
    // The client treats only status === 'active' as paid; trialing counts as
    // active so a Stripe-side trial (if ever added) unlocks immediately.
    const status =
      sub.status === "active" || sub.status === "trialing" ? "active" : "canceled";
    const { error } = await admin.from("subscriptions").upsert({
      user_id: userId,
      tier: "pro",
      status,
      stripe_customer_id:
        typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      current_period_end: sub.current_period_end * 1000,
      updated_at: Date.now(),
    });
    if (error) console.error("subscriptions upsert failed", error);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id,
          );
          if (!sub.metadata?.user_id && session.client_reference_id) {
            sub.metadata = { ...sub.metadata, user_id: session.client_reference_id };
          }
          await upsertFromSubscription(sub);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await upsertFromSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        // Unrequested event type — acknowledge and ignore.
        break;
    }
    return plain(200, "ok");
  } catch (e) {
    console.error("webhook handling failed", e);
    // Non-2xx makes Stripe retry — correct for transient DB errors.
    return plain(500, "internal error");
  }
});
