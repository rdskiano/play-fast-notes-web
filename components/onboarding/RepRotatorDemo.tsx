import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/palette';
import { Type } from '@/constants/tokens';

// "Watch how it works" demo of Rep Rotator. Unlike the other strategies it can't
// be shown on one phrase — it's about rotating between DIFFERENT passages. So
// this is a little mock of the real flow: pick 3 of 5 passages (tap, or shuffle),
// then run a mock interleaved session — the passage name changes in random order,
// you mark Clean/Miss toward 3-in-a-row on each, and every rep surfaces a
// different bit of the science behind why rotating like this works. No audio
// (there are no real passages loaded), so it's user-driven, not self-playing.

const ORANGE = '#C9772E'; // rep_rotator strategy color
const ORANGE_SOFT = '#F6E9DC';

const PASSAGES = ['Passage 1', 'Passage 2', 'Passage 3', 'Passage 4', 'Passage 5'];
const PICK = 3;
const GOAL = 3; // clean reps in a row, per passage

// Each rep surfaces a different bit of the science behind interleaving (Ralph's
// curated facts; bodies lightly tightened for the card).
const FACTS: { title: string; body: string }[] = [
  {
    title: 'It trains your brain to reconstruct a skill from scratch.',
    body: 'In a performance or audition you get one chance to play a passage perfectly. Interleaving mimics that — you adjust on the fly and execute a complex skill flawlessly on the first try, with no warm-up reps.',
  },
  {
    title: 'It takes advantage of the brain’s need to forget.',
    body: 'Switching passages makes your brain briefly forget the feel of playing one. Cycling back, it has to test itself to recall it — working harder and cementing the skill into long-term storage.',
  },
  {
    title: 'It builds nimbleness through “contextual interference.”',
    body: 'Rapidly switching between slightly different skills makes them interfere in the brain. That friction is harder, but it trains you to switch gears and execute different movements perfectly in the moment.',
  },
  {
    title: 'It shatters the “illusion of mastery.”',
    body: 'Repeating one passage back-to-back lets you go on autopilot — a false sense of security. Interleaving removes that illusion and gives an accurate test of your real performance readiness.',
  },
  {
    title: 'It makes performing feel effortless.',
    body: 'fMRI scans show interleaving makes the brain work hard while practicing — but on stage those skills need minimal activation. Less work on the technical frees up capacity for musical expression.',
  },
  {
    title: 'It improves your reaction time.',
    body: 'Interleaving raises “motor cortex excitability” — which correlates with faster reaction times and more efficient retrieval of motor memory.',
  },
  {
    title: 'It jump-starts long-term storage.',
    body: 'It activates the sensorimotor cortex and posterior putamen together — areas that normally only communicate once a skill is already in stable, long-term storage.',
  },
];

type Props = { onDone: () => void };

export function RepRotatorDemo({ onDone }: Props) {
  const [phase, setPhase] = useState<'select' | 'rotate' | 'done'>('select');
  const [selected, setSelected] = useState<string[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState('');
  const [reps, setReps] = useState(0);

  function toggle(p: string) {
    setSelected((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : prev.length < PICK ? [...prev, p] : prev,
    );
  }

  function shuffle() {
    const pick = [...PASSAGES].sort(() => Math.random() - 0.5).slice(0, PICK);
    setSelected(pick);
  }

  function start() {
    if (selected.length !== PICK) return;
    const s: Record<string, number> = {};
    selected.forEach((p) => (s[p] = 0));
    setStreaks(s);
    setCurrent(selected[Math.floor(Math.random() * selected.length)]);
    setReps(0);
    setPhase('rotate');
  }

  // Next passage: random among those not yet at the goal, preferring a different
  // one than the current so the rotation is visible.
  function pickNext(after: string, s: Record<string, number>): string | null {
    const incomplete = selected.filter((p) => (s[p] ?? 0) < GOAL);
    if (incomplete.length === 0) return null;
    const others = incomplete.filter((p) => p !== after);
    const pool = others.length ? others : incomplete;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function mark(clean: boolean) {
    const s = {
      ...streaks,
      [current]: clean ? Math.min(GOAL, (streaks[current] ?? 0) + 1) : 0,
    };
    setStreaks(s);
    setReps((r) => r + 1);
    const nxt = pickNext(current, s);
    if (!nxt) setPhase('done');
    else setCurrent(nxt);
  }

  function reset() {
    setSelected([]);
    setStreaks({});
    setCurrent('');
    setReps(0);
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
          <Text style={styles.miniCaption}>Pulls them in random order — 3 clean in a row on each.</Text>
          <View style={styles.stage}>
            <Text style={styles.current}>{current}</Text>
            <View style={styles.dots}>
              {Array.from({ length: GOAL }, (_, i) => {
                const on = (streaks[current] ?? 0) > i;
                return (
                  <View
                    key={i}
                    style={[styles.dot, on ? { backgroundColor: ORANGE, borderColor: ORANGE } : null]}
                  />
                );
              })}
            </View>
          </View>

          <View style={styles.factCard}>
            <Text style={styles.factLabel}>WHY IT WORKS</Text>
            <Text style={styles.factTitle}>{FACTS[reps % FACTS.length].title}</Text>
            <Text style={styles.factText}>{FACTS[reps % FACTS.length].body}</Text>
          </View>

          <View style={styles.actions}>
            <Pressable style={[styles.markBtn, { borderColor: Palette.borderStrong }]} onPress={() => mark(false)}>
              <Text style={[styles.markText, { color: Palette.textSecondary }]}>✗ Miss</Text>
            </Pressable>
            <Pressable style={[styles.markBtn, { backgroundColor: ORANGE, borderColor: ORANGE }]} onPress={() => mark(true)}>
              <Text style={[styles.markText, { color: '#fff' }]}>✓ Clean</Text>
            </Pressable>
          </View>

          <View style={styles.progRow}>
            {selected.map((p) => {
              const complete = (streaks[p] ?? 0) >= GOAL;
              const isCur = p === current;
              return (
                <Text
                  key={p}
                  style={[
                    styles.progItem,
                    complete ? { color: ORANGE, fontWeight: Type.weight.semibold } : null,
                    isCur ? { color: Palette.text } : null,
                  ]}>
                  {complete ? '✓ ' : isCur ? '▸ ' : ''}
                  {p.replace('Passage ', 'P')}
                </Text>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <View style={styles.doneStage}>
            <Text style={styles.doneEmoji}>🎉</Text>
            <Text style={styles.doneTitle}>Cleaned all {PICK} passages!</Text>
            <Text style={styles.doneBody}>
              That’s rep rotator — three clean in a row on each, in random order, the way you’ll
              have to deliver them.
            </Text>
          </View>
          <Pressable style={[styles.ghostBtn, styles.startOver, { borderColor: ORANGE }]} onPress={reset}>
            <Text style={[styles.ghostText, { color: ORANGE }]}>↺ Try it again</Text>
          </Pressable>
        </>
      )}

      <Pressable
        style={styles.exitBtn}
        onPress={onDone}>
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

  miniCaption: { fontSize: 12, color: Palette.textSecondary, textAlign: 'center', marginBottom: 10 },
  stage: { alignItems: 'center', marginBottom: 12 },
  current: { fontSize: 22, fontWeight: Type.weight.semibold, color: Palette.text, marginBottom: 10 },
  dots: { flexDirection: 'row', gap: 10 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: Palette.borderStrong },

  factCard: {
    backgroundColor: Palette.card,
    borderWidth: 0.5,
    borderColor: Palette.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    minHeight: 150,
  },
  factLabel: { fontSize: 10, letterSpacing: 0.8, color: ORANGE, fontWeight: Type.weight.semibold, marginBottom: 5 },
  factTitle: { fontSize: 14, lineHeight: 19, fontWeight: Type.weight.semibold, color: Palette.text, marginBottom: 4 },
  factText: { fontSize: 13, lineHeight: 19, color: Palette.textSecondary },

  actions: { flexDirection: 'row', gap: 8, marginBottom: 8 },
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

  progRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 4 },
  progItem: { fontSize: 12, color: Palette.textMuted },

  doneStage: { alignItems: 'center', paddingVertical: 8, marginBottom: 8 },
  doneEmoji: { fontSize: 56, marginBottom: 8 },
  doneTitle: { fontSize: 18, fontWeight: Type.weight.semibold, color: Palette.text, marginBottom: 6 },
  doneBody: { fontSize: 14, lineHeight: 20, color: Palette.textSecondary, textAlign: 'center' },
  startOver: { alignSelf: 'center', marginBottom: 4 },

  exitBtn: { alignSelf: 'center', paddingVertical: 10 },
  exitText: { fontSize: 14, color: Palette.textSecondary, fontWeight: Type.weight.semibold },
});
