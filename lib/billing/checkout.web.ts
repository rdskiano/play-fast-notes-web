// Web checkout: ask the create-checkout-session edge function for a Stripe
// Checkout URL and send the browser there. Stripe redirects back to the app
// with ?checkout=success / ?checkout=cancelled; the subscriptions row is
// written by the stripe-webhook function, so Pro unlocks on the next load
// after payment (usually seconds).

import { supabase } from '@/lib/supabase/client';

export type CheckoutPlan = 'annual' | 'monthly';

export async function startCheckout(plan: CheckoutPlan): Promise<void> {
  const { data, error } = await supabase.functions.invoke(
    'create-checkout-session',
    { body: { plan } },
  );
  if (error) throw error;
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error('No checkout URL returned.');
  window.location.assign(url);
}
