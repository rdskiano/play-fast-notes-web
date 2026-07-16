// ── Master instrument list ───────────────────────────────────────────────────
//
// THE single answer to "what do you play?". Each entry is a real instrument
// name — the same 16 names the onboarding welcome screen offers — and carries
// pointers to the notation mechanics in lib/music/pitch.ts: `pitchId` names
// the INSTRUMENTS entry whose transposeSemitones drives written↔concert
// conversion, `clefId` is the clef the instrument reads by default.
//
// Clarinet is the one instrument with VARIANTS (Ralph's call, 2026-07-15):
// one player, several horns, chosen per exercise — B♭ (default), A, E♭, Bass.
// Every other instrument has exactly one form, so pickers only show the
// variant row when `variants` is present.
//
// Exercises saved before this list existed store transposition-class ids
// (`concert`, the old combined `bb_clarinet` "B♭ clarinet / trumpet", …).
// Those ids stay resolvable in pitch.ts forever; LEGACY_PITCH_TO_MASTER below
// maps them to a representative master instrument so old exercises still
// highlight something sensible in the picker. Hydrating an old exercise never
// rewrites its stored id — only an explicit re-pick does.

export type InstrumentVariant = {
  /** pitch.ts INSTRUMENTS id this variant plays/notates as. */
  pitchId: string;
  /** Short label for the variant row, e.g. "B♭". */
  label: string;
};

export type MasterInstrument = {
  id: string;
  /** Display name — matches ONBOARDING_INSTRUMENTS names exactly. */
  name: string;
  /** Section header family (same grouping as the onboarding picker). */
  group: string;
  /** Default pitch.ts INSTRUMENTS id (the default variant's, if variants). */
  pitchId: string;
  /** CLEFS id the instrument reads by default. */
  clefId: string;
  /** Present only when the player chooses a horn per exercise (clarinet). */
  variants?: InstrumentVariant[];
};

export const MASTER_INSTRUMENTS: MasterInstrument[] = [
  { id: 'piano', name: 'Piano', group: 'Concert pitch', pitchId: 'piano', clefId: 'treble' },
  { id: 'flute', name: 'Flute', group: 'Concert pitch', pitchId: 'flute', clefId: 'treble' },
  { id: 'oboe', name: 'Oboe', group: 'Concert pitch', pitchId: 'oboe', clefId: 'treble' },
  { id: 'violin', name: 'Violin', group: 'Concert pitch', pitchId: 'violin', clefId: 'treble' },
  { id: 'guitar', name: 'Guitar', group: 'Concert pitch', pitchId: 'guitar', clefId: 'treble' },
  {
    id: 'clarinet',
    name: 'Clarinet',
    group: 'B♭ instruments',
    pitchId: 'bb_clarinet',
    clefId: 'treble',
    variants: [
      { pitchId: 'bb_clarinet', label: 'B♭' },
      { pitchId: 'a_clarinet', label: 'A' },
      { pitchId: 'eb_clarinet', label: 'E♭' },
      { pitchId: 'bass_clarinet', label: 'Bass' },
    ],
  },
  { id: 'trumpet', name: 'Trumpet', group: 'B♭ instruments', pitchId: 'trumpet', clefId: 'treble' },
  { id: 'tenor_sax', name: 'Tenor saxophone', group: 'B♭ instruments', pitchId: 'tenor_sax', clefId: 'treble' },
  { id: 'alto_sax', name: 'Alto saxophone', group: 'E♭ instruments', pitchId: 'alto_sax', clefId: 'treble' },
  { id: 'bari_sax', name: 'Baritone saxophone', group: 'E♭ instruments', pitchId: 'bari_sax', clefId: 'treble' },
  { id: 'french_horn', name: 'French horn', group: 'F instruments', pitchId: 'french_horn', clefId: 'treble' },
  { id: 'cello', name: 'Cello', group: 'Bass clef', pitchId: 'cello', clefId: 'bass' },
  { id: 'bassoon', name: 'Bassoon', group: 'Bass clef', pitchId: 'bassoon', clefId: 'bass' },
  { id: 'trombone', name: 'Trombone', group: 'Bass clef', pitchId: 'trombone', clefId: 'bass' },
  { id: 'tuba', name: 'Tuba', group: 'Bass clef', pitchId: 'tuba', clefId: 'bass' },
  { id: 'viola', name: 'Viola', group: 'Alto clef', pitchId: 'viola', clefId: 'alto' },
];

/**
 * Representative master instrument for a pre-master-list pitch id, DISPLAY
 * ONLY. `concert` could have been any concert-pitch treble instrument and the
 * combined ids covered two instruments each — the transposition is identical
 * either way, so the picker just needs something sensible to highlight.
 */
const LEGACY_PITCH_TO_MASTER: Record<string, string> = {
  concert: 'flute',
  eb_alto_sax: 'alto_sax',
  bb_tenor_sax: 'tenor_sax',
  eb_bari_sax: 'bari_sax',
  f_horn: 'french_horn',
};

/** The master instrument whose default or variant pitch id is `pitchId`. */
export function masterForPitchId(pitchId: string): MasterInstrument | null {
  const direct = MASTER_INSTRUMENTS.find(
    (m) => m.pitchId === pitchId || m.variants?.some((v) => v.pitchId === pitchId),
  );
  if (direct) return direct;
  const legacy = LEGACY_PITCH_TO_MASTER[pitchId];
  return legacy ? (MASTER_INSTRUMENTS.find((m) => m.id === legacy) ?? null) : null;
}

/** Lookup by display name — how the onboarding answer is stored. */
export function masterByName(name: string): MasterInstrument | null {
  return MASTER_INSTRUMENTS.find((m) => m.name === name) ?? null;
}
