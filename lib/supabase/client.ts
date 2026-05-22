import { createClient } from '@supabase/supabase-js';

import { fileSessionStore } from './sessionStore';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// iPad is local-SQLite-first, but the Apple Pencil annotation feature writes
// to Supabase — annotations are the one piece of data shared live with web —
// so the session is persisted: the user signs in once and stays signed in.
// Persistence is backed by a small filesystem store (see ./sessionStore), so
// there's no AsyncStorage / SecureStore dependency and no native rebuild.
//
// Do NOT throw at module load if the keys are missing: this module sits in the
// startup chain (_layout -> useSession -> here), so a throw is an instant
// launch crash on a release build with no error surface. Fall back to a
// placeholder so the app boots; the sign-in / annotation flows surface the
// real failure if the user goes there.
if (!url || !anonKey) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / ANON_KEY missing — sign-in and sync will not work.',
  );
}

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      storage: fileSessionStore,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
