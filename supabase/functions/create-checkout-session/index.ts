// create-checkout-session — starts a Stripe Checkout for the one-time
// Practice Pro unlock ($19.99, buy once, keep forever).
//
// POST {} (no body needed). Auth via the caller's JWT (attached
// automatically by supabase.functions.invoke). Returns { url } — the client
// redirects the browser there. The subscriptions row is NOT written here;
// the stripe-webhook function owns that, driven by Stripe's events.
//
// There is no Stripe-side trial: the app's own 30-day trial runs off the
// account's creation date with no card on file. By the time someone reaches
// Checkout they're past (or skipping) the trial, so they're charged now.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY      sk_live_... (or sk_test_... while testing)
//   STRIPE_PRICE_LIFETIME  price_... for the $19.99 one-time unlock
// Optional:
//   APP_URL                defaults to https://playfastnotes.com

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!auth) return json(401, { error: "missing authorization header" });
    const token = auth.replace(/^Bearer\s+/i, "").trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const priceId = Deno.env.get("STRIPE_PRICE_LIFETIME");
    if (!stripeKey || !priceId) return json(500, { error: "billing not configured" });

    // Who is calling? Derive the user from the verified token, never the body.
    const asUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userError } = await asUser.auth.getUser(token);
    if (userError || !userData.user) return json(401, { error: "unauthenticated" });
    const user = userData.user;

    const stripe = new Stripe(stripeKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Reuse the Stripe customer across retries / earlier subscription-era
    // rows so one user never accumulates duplicate customers.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: subRow } = await admin
      .from("subscriptions")
      .select("stripe_customer_id, tier, status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    // Already unlocked FOREVER (bought, or holding a lifetime comp)? Don't
    // let them pay twice — send them home instead of to Checkout. A DATED
    // comp (the free-month / six-month cohorts) is different: those users
    // are exactly who the expiry emails invite to buy, so they pass through;
    // the webhook upserts their row to the lifetime pro shape on payment.
    const LIFETIME_AFTER_MS = 4_000_000_000_000; // ~2096; matches constants/billing.ts
    const appUrl = Deno.env.get("APP_URL") ?? "https://playfastnotes.com";
    const alreadyForever =
      subRow &&
      subRow.status === "active" &&
      typeof subRow.current_period_end === "number" &&
      subRow.current_period_end > Date.now() &&
      (subRow.tier === "pro" || subRow.current_period_end > LIFETIME_AFTER_MS);
    if (alreadyForever) return json(200, { url: `${appUrl}/?checkout=already` });

    let customerId = subRow?.stripe_customer_id as string | null | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("subscriptions").upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        updated_at: Date.now(),
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { user_id: user.id },
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
    });

    return json(200, { url: session.url });
  } catch (e) {
    console.error("create-checkout-session failed", e);
    return json(500, { error: "internal error" });
  }
});
