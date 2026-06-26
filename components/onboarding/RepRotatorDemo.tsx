import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/palette';
import { Type } from '@/constants/tokens';

// "Watch how it works" demo of Rep Rotator. It can't be shown on one phrase —
// it's about rotating between DIFFERENT passages — so it's a little mock of the
// real flow: pick 3 of 5 passages (tap, or shuffle), then a ROTATION BOARD shows
// all three at once with their own streaks. You mark Clean/Miss on the
// highlighted one; it visibly jumps to a random other one each rep (a miss
// empties that passage's streak). Get 3 clean in a row on each and it's done.
// Seeing all three + the jumping spotlight is what makes the process click.
// One persistent "why it works" line, not a rotating wall of facts. No audio.

const ORANGE = '#C9772E'; // rep_rotator strategy color
const ORANGE_SOFT = '#F6E9DC';
const CLEAN_FLASH = '#E4F1E8';
const MISS_FLASH = '#F6E5E2';

const PASSAGES = ['Passage 1', 'Passage 2', 'Passage 3', 'Passage 4', 'Passage 5'];
const PICK = 3;
const GOAL = 3; // clean reps in a row, per passage

// ONE persistent fact (Ralph: the rotating wall of facts was distracting — pick
// the most powerful and leave it). His lead fact, which fits the visual: the
// constant jumping means you summon each passage cold. Swap `FACT` for any of
// the curated alternatives below.
const FACT = {
  title: 'It trains your brain to reconstruct a skill from scratch.',
  body: 'In a performance or audition you get one chance to play it right — no warm-up reps. Rotating like this rehearses exactly that: summoning each passage cold and nailing it first try.',
};
// Other curated facts (Ralph's), kept for easy swapping:
//  - 'It takes advantage of the brain’s need to forget.' — Switching passages
//    makes your brain briefly forget the feel of one; cycling back forces it to
//    retrieve the skill, which cements it into long-term storage.
//  - 'It builds nimbleness through “contextual interference.”' — Rapidly
//    switching similar skills makes them interfere; that friction trains you to
//    switch gears and execute the right movement in the moment.
//  - 'It shatters the “illusion of mastery.”' — Back-to-back repetition lets you
//    autopilot into false security; interleaving gives an honest test of
//    performance readiness.
//  - 'It makes performing feel effortless.' — fMRI shows interleaving works the
//    brain hard in practice but needs minimal activation on stage, freeing
//    capacity for musical expression.
//  - 'It improves your reaction time.' — Raises motor-cortex excitability,
//    correlated with faster reaction times and more efficient motor recall.
//  - 'It jump-starts long-term storage.' — Activates the sensorimotor cortex and
//    posterior putamen together — areas that normally only talk once a skill is
//    already in stable storage.

type Flash = { id: string; kind: 'clean' | 'miss' } | null;

type Props = { onDone: () => void };

export function RepRotatorDemo({ onDone }: Props) {
  const [phase, setPhase] = useState<'select' | 'rotate' | 'done'>('select');
  const [selected, setSelected] = useState<string[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState('');
  const [flash, setFlash] = useState<Flash>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  function toggle(p: string) {
    setSelected((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : prev.length < PICK ? [...prev, p] : prev,
    );
  }

  function shuffle() {
    setSelected([...PASSAGES].sort(() => Math.random() - 0.5).slice(0, PICK));
  }

  function start() {
    if (selected.length !== PICK) return;
    const s: Record<string, number> = {};
    selected.forEach((p) => (s[p] = 0));
    setStreaks(s);
    setCurrent(selected[Math.floor(Math.random() * selected.length)]);
    setFlash(null);
    setPhase('rotate');
  }

  function pickNext(after: string, s: Record<string, number>): string | null {
    const incomplete = selected.filter((p) => (s[p] ?? 0) < GOAL);
    if (incomplete.length === 0) return null;
    const others = incomplete.filter((p) => p !== after);
    const pool = others.length ? others : incomplete;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Mark the highlighted passage, then — after a beat so the result registers —
  // jump the spotlight to a random other one (or finish).
  function mark(clean: boolean) {
    if (flash) return; // ignore taps mid-jump
    const marked = current;
    const s = {
      ...streaks,
      [marked]: clean ? Math.min(GOAL, (streaks[marked] ?? 0) + 1) : 0,
    };
    setStreaks(s);
    setFlash({ id: marked, kind: clean ? 'clean' : 'miss' });
    timers.current.push(
      setTimeout(() => {
        setFlash(null);
        const nxt = pickNext(marked, s);
        if (!nxt) setPhase('done');
        else setCurrent(nxt);
      }, 600),
    );
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    setSelected([]);
    setStreaks({});
    setCurrent('');
    setFlash(null);
    setPhase('select');
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>Rep rotator</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>random order</Text>
        </View>
      </View>

      {phase === 'select' ? (
        <>
          <Text style={styles.prompt}>Pick 3 passages to rotate — tap three, or shuffle.</Text>
          <View style={styles.list}>
            {PASSAGES.map((p) => {
              const sel = selected.includes(p);
              return (
                <Pressable
                  key={p}
                  onPress={() => toggle(p)}
                  style={[styles.row, sel ? { borderColor: ORANGE, backgroundColor: ORANGE_SOFT } : null]}>
                  <View style={[styles.check, sel ? { backgroundColor: ORANGE, borderColor: ORANGE } : null]}>
                    {sel ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>
                  <Text style={styles.rowText}>{p}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.actions}>
            <Pressable style={styles.ghostBtn} onPress={shuffle}>
              <Text style={[styles.ghostText, { color: ORANGE }]}>🎲 Pick 3 for me</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: selected.length === PICK ? ORANGE : Palette.borderStrong }]}
              disabled={selected.length !== PICK}
              onPress={start}>
              <Text style={styles.primaryText}>Start →</Text>
            </Pressable>
          </View>
        </>
      ) : phase === 'rotate' ? (
        <>
          <Text style={styles.miniCaption}>
            Mark the highlighted one — it jumps around. 3 clean in a row on each.
          </Text>

          <View style={styles.board}>
            {selected.map((p) => {
              const streak = streaks[p] ?? 0;
              const complete = streak >= GOAL;
              const active = p === current && !complete;
              const isFlash = flash?.id === p;
              const bg = isFlash
                ? flash!.kind === 'clean'
                  ? CLEAN_FLASH
                  : MISS_FLASH
                : active
                  ? ORANGE_SOFT
                  : Palette.card;
              return (
                <View
                  key={p}
                  style={[
                    styles.boardRow,
                    { backgroundColor: bg },
                    active ? { borderColor: ORANGE } : null,
                    complete ? { opacity: 0.55 } : null,
                  ]}>
                  <Text style={styles.boardMark}>{complete ? '✓' : active ? '▶' : ''}</Text>
                  <Text style={[styles.boardName, active ? { fontWeight: Type.weight.semibold } : null]}>{p}</Text>
                  <View style={styles.boardDots}>
                    {Array.from({ length: GOAL }, (_, i) => {
                      const on = streak > i;
                      return (
                        <View
                          key={i}
                          style={[
                            styles.bdot,
                            on ? { backgroundColor: ORANGE, borderColor: ORANGE } : null,
                          ]}
                        />
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.markBtn, { borderColor: Palette.borderStrong }]}
              disabled={!!flash}
              onPress={() => mark(false)}>
              <Text style={[styles.markText, { color: Palette.textSecondary }]}>✗ Miss</Text>
            </Pressable>
            <Pressable
              style={[styles.markBtn, { backgroundColor: ORANGE, borderColor: ORANGE }]}
              disabled={!!flash}
              onPress={() => mark(true)}>
              <Text style={[styles.markText, { color: '#fff' }]}>✓ Clean</Text>
            </Pressable>
          </View>

          <View style={styles.factCard}>
            <Text style={styles.factLabel}>WHY IT WORKS</Text>
            <Text style={styles.factTitle}>{FACT.title}</Text>
            <Text style={styles.factText}>{FACT.body}</Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.doneStage}>
            <Text style={styles.doneEmoji}>🎉</Text>
            <Text style={styles.doneTitle}>Cleaned all {PICK} passages!</Text>
            <Text style={styles.doneBody}>
              Rapidly switching between slightly different skills causes them to “interfere” with
              each other in the brain. This cognitive friction makes the process harder but
              ultimately trains the brain to rapidly switch gears and remember how to execute
              different movements perfectly in the moment.
            </Text>
          </View>
          <Pressable style={[styles.ghostBtn, styles.startOver, { borderColor: ORANGE }]} onPress={reset}>
            <Text style={[styles.ghostText, { color: ORANGE }]}>↺ Try it again</Text>
          </Pressable>
        </>
      )}

      <Pressable style={styles.exitBtn} onPress={onDone}>
        <Text style={styles.exitText}>I got it →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    backgroundColor: Palette.surfaceSunk,
    borderRadius: 14,
    padding: 16,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  kicker: { fontSize: 13, color: Palette.textSecondary },
  pill: { backgroundColor: ORANGE_SOFT, paddingHorizontal: 9, paddingVertical: 2, borderRadius: 8 },
  pillText: { fontSize: 12, color: ORANGE, fontWeight: Type.weight.semibold },

  prompt: { fontSize: 14, color: Palette.text, marginBottom: 10, textAlign: 'center' },
  list: { gap: 6, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Palette.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 12, fontWeight: Type.weight.bold },
  rowText: { fontSize: 14, color: Palette.text },

  miniCaption: { fontSize: 12, color: Palette.textSecondary, textAlign: 'center', marginBottom: 12 },

  board: { gap: 8, marginBottom: 14 },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Palette.border,
  },
  boardMark: { width: 18, fontSize: 14, color: ORANGE, fontWeight: Type.weight.bold },
  boardName: { flex: 1, fontSize: 15, color: Palette.text },
  boardDots: { flexDirection: 'row', gap: 7 },
  bdot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.5, borderColor: Palette.borderStrong },

  actions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  ghostBtn: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: { fontSize: 14, fontWeight: Type.weight.semibold },
  primaryBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 15, color: '#fff', fontWeight: Type.weight.semibold },
  markBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { fontSize: 15, fontWeight: Type.weight.semibold },

  factCard: {
    backgroundColor: Palette.card,
    borderWidth: 0.5,
    borderColor: Palette.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  factLabel: { fontSize: 10, letterSpacing: 0.8, color: ORANGE, fontWeight: Type.weight.semibold, marginBottom: 5 },
  factTitle: { fontSize: 14, lineHeight: 19, fontWeight: Type.weight.semibold, color: Palette.text, marginBottom: 4 },
  factText: { fontSize: 13, lineHeight: 19, color: Palette.textSecondary },

  doneStage: { alignItems: 'center', paddingVertical: 8, marginBottom: 8 },
  doneEmoji: { fontSize: 56, marginBottom: 8 },
  doneTitle: { fontSize: 18, fontWeight: Type.weight.semibold, color: Palette.text, marginBottom: 6 },
  doneBody: { fontSize: 14, lineHeight: 20, color: Palette.textSecondary, textAlign: 'center' },
  startOver: { alignSelf: 'center', marginBottom: 4 },

  exitBtn: { alignSelf: 'center', paddingVertical: 10 },
  exitText: { fontSize: 14, color: Palette.textSecondary, fontWeight: Type.weight.semibold },
});
