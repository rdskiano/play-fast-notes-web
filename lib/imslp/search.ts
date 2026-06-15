// IMSLP search client. Calls the imslp-search edge function (the browser can't
// hit IMSLP's API directly — CORS). Search/metadata only; the actual PDF
// download is a user-driven handoff to IMSLP's own page (their gate, their
// terms). Used on both platforms via the web Supabase client.

import { supabase } from '@/lib/supabase/client';

export type ImslpResult = {
  /** Full IMSLP page title, e.g. "Nocturne… (Chopin, Frédéric)". */
  title: string;
  /** Work title without the trailing "(Composer)". */
  work: string;
  /** "Firstname Lastname", or null if unparseable. */
  composer: string | null;
  snippet: string;
  /** The IMSLP work page — where the user picks an edition and downloads. */
  pageUrl: string;
};

export async function searchImslp(query: string): Promise<ImslpResult[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  const { data, error } = await supabase.functions.invoke('imslp-search', {
    body: { query: q },
  });
  if (error) throw error;
  return ((data as { results?: ImslpResult[] } | null)?.results ?? []);
}
