import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL');
if (!anonKey) throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY');

// iPad is local-SQLite-first. The Supabase client exists only for the one-shot
// /import-supabase dev route. Session persistence would need AsyncStorage; we
// skip it because the import is one-and-done — the user signs in, runs the
// import, never touches Supabase from iPad again.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
