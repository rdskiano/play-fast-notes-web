import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// iPad is local-SQLite-first. The Supabase client exists only for the one-shot
// /import-supabase dev route. Session persistence would need AsyncStorage; we
// skip it because the import is one-and-done — the user signs in, runs the
// import, never touches Supabase from iPad again.
//
// Do NOT throw at module load if the keys are missing: this module sits in the
// startup import chain (_layout → useSession → here), so a throw is an instant
// launch crash on a release build with no error surface. Native genuinely
// doesn't need Supabase to run — fall back to a placeholder so the app boots,
// and let /import-supabase report the real failure if the user goes there.
if (!url || !anonKey) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / ANON_KEY missing — /import-supabase will not work.',
  );
}

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);
