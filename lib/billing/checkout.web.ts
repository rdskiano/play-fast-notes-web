// Web checkout: ask the create-checkout-session edge function for a Stripe
// Checkout URL and send the browser there. One product, one price — a
// one-time $19.99 payment that unlocks the app forever (no plans to pick).
// Stripe redirects back with ?checkout=success / ?checkout=cancelled; the
// subscriptions row is written by the stripe-webhook function, so the
// unlock lands on the next load after payment (usually seconds).

import { supabase } from '@/lib/supabase/client';

export async function startCheckout(): Promise<void> {
  const { data, error } = await supabase.functions.invoke(
    'create-checkout-session',
    { body: {} },
  );
  if (error) throw error;
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error('No checkout URL returned.');
  window.location.assign(url);
}
