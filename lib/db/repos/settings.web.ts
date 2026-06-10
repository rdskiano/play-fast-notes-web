import { supabase } from '@/lib/supabase/client';
import { DEMO_TUTORIAL_EMAIL, isTutorialSeenKey } from '@/lib/tutorials/demoMode';

// The demo/QA account (DEMO_TUTORIAL_EMAIL) re-experiences every tutorial on
// each load: we neither read nor persist its "seen" flags. getSession() reads
// the locally-cached session (no network), so this check is cheap.
async function isDemoTutorialAccount(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email === DEMO_TUTORIAL_EMAIL;
}

export async function getSetting(key: string): Promise<string | null> {
  // Demo account: report tutorial-seen flags as never-seen so they re-fire.
  if (isTutorialSeenKey(key) && (await isDemoTutorialAccount())) return null;

  const { data, error } = await supabase
    .from('settings')
    .select('value_json')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  try {
    return JSON.parse(data.value_json) as string;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  // Demo account: don't remember that a tutorial was seen.
  if (isTutorialSeenKey(key) && (await isDemoTutorialAccount())) return;

  const { error } = await supabase
    .from('settings')
    .upsert({ key, value_json: JSON.stringify(value) }, { onConflict: 'user_id,key' });
  if (error) throw error;
}
