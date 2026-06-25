// Seed the Flight of the Bumblebee sample into a new user's library.
//
// "Maybe later" at the end of onboarding used to drop the user into an EMPTY
// library — which is the exact 61%-leak symptom (and, on the demo account that
// ignores the "seen onboarding" flag, an empty library bounces straight back
// into the funnel). Leaving the Bumblebee sample behind as a real, playable
// piece means the shelf is never empty: the redirect only fires on zero pieces,
// and the user can reopen the rhythm exercise they just felt anytime.
//
// Cross-platform: the repo imports resolve to Supabase (web) or SQLite (native)
// automatically; both expose the same signatures.

import { insertExercise } from '@/lib/db/repos/exercises';
import { insertPassage, listPassages } from '@/lib/db/repos/passages';
import { buildPitchAbc } from '@/lib/notation/buildPitchAbc';

import {
  bucketWrittenPitches,
  clefFor,
  keySignatureFor,
  STARTER_GROUPING,
  type BumblebeeBucket,
} from './bumblebee';
import { renderPhraseImage } from './renderPhraseImage';

const SEED_TITLE = 'Flight of the Bumblebee';

/**
 * Create the Bumblebee piece + its rhythm exercise for `bucket` (the user's
 * instrument family) if it doesn't already exist. Returns the piece id, or null
 * on failure (best-effort — must never block leaving onboarding). The exercise
 * stores the same config the Rhythm Builder writes, so opening it lands on the
 * pitched variations the user just heard.
 */
export async function seedBumblebeePiece(bucket: BumblebeeBucket): Promise<string | null> {
  try {
    const existing = (await listPassages()).find((p) => p.title === SEED_TITLE);
    if (existing) return existing.id;

    const pitches = bucketWrittenPitches(bucket);

    // Render the phrase (beamed sixteenths, in the user's clef) to a picture so
    // the library card shows the actual music. Web-only + best-effort: null on
    // native or failure falls back to a placeholder card.
    const abc = buildPitchAbc(pitches, keySignatureFor(bucket), clefFor(bucket), {
      beamGroup: STARTER_GROUPING,
    });
    const image = await renderPhraseImage(abc);

    const id = `p_bumblebee_${Date.now()}`;
    await insertPassage({
      id,
      title: SEED_TITLE,
      composer: 'Rimsky-Korsakov',
      source_kind: 'image',
      source_uri: image ?? '',
      thumbnail_uri: image ?? null,
    });

    const config = JSON.stringify({
      instrumentId: bucket.instrumentId,
      keyId: bucket.keyId,
      clefId: bucket.clefId,
      grouping: STARTER_GROUPING,
      pitches,
      useSharps: true,
    });
    await insertExercise(id, 'rhythmic', 'Rhythm variations', config);
    return id;
  } catch {
    return null;
  }
}
