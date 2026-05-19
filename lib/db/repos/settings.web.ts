import { supabase } from '@/lib/supabase/client';

export async function getSetting(key: string): Promise<string | null> {
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
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value_json: JSON.stringify(value) }, { onConflict: 'user_id,key' });
  if (error) throw error;
}
