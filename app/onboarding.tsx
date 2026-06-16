import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

// The guided "Coach me" front door. Two observable questions — how the
// passage FEELS and what it LOOKS like — route to exactly one practice
// tool, pre-configured (no setup screen). See the design notes: even &
// running is the only case that goes to Rhythm Variations; everything
// else is decided by feel.
type Feel = 'unfamiliar' | 'even' | 'faster' | 'spot';
type Character = 'even' | 'mixed';
type Step = 'entry' | 'photo' | 'feel' | 'char' | 'result';

type ToolKey = 'rhythmic' | 'tempo-ladder' | 'click-up' | 'micro-chaining';

const TOOLS: Record<ToolKey, { name: string; blurb: string }> = {
  rhythmic: {
    name: 'Rhythm Variations',
    blurb:
      'We’ll run it through fast-and-slow note combos until it comes out even and clean.',
  },
  'tempo-ladder': {
    name: 'Tempo Ladder',
    blurb:
      'Pick a tempo you can actually play, nail clean reps, and climb from there.',
  },
  'click-up': {
    name: 'Interleaved Click-Up',
    blurb:
      'Random tempos and start points wire it in so it holds together under pressure.',
  },
  'micro-chaining': {
    name: 'Micro-chaining',
    blurb: 'Rebuild that one tricky spot note by note, right at full speed.',
  },
};

// The routing tree, exactly as designed: even & running -> Rhythm
// Variations regardless of feel; otherwise feel decides.
function routeFor(feel: Feel, character: Character): ToolKey {
  if (character === 'even') return 'rhythmic';
  if (feel === 'unfamiliar') return 'tempo-ladder';
  if (feel === 'spot') return 'micro-chaining';
  return 'click-up'; // 'even' (needs to be more even) or 'faster'
}

const STEP_INDEX: Record<Step, number> = {
  entry: 0,
  photo: 1,
  feel: 2,
  char: 3,
  result: 4,
};

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ passageId?: string }>();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const insets = useSafeAreaInsets();

  const [history, setHistory] = useState<Step[]>([]);
  // When upload hands a freshly-created passage back (?passageId=...), skip the
  // entry + photo screens and resume at the first question.
  const [step, setStep] = useState<Step>(params.passageId ? 'feel' : 'entry');
  const [feel, setFeel] = useState<Feel | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);

  function go(next: Step) {
    setHistory((h) => [...h, step]);
    setStep(next);
  }
  function back() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setStep(prev);
      return h.slice(0, -1);
    });
  }

  function begin() {
    const target = routeFor(feel!, character!);
    if (params.passageId) {
      // Pre-config params travel on the URL; the tool screen reads them.
      router.replace(
        `/passage/${params.passageId}/${target}?guided=1` as never,
      );
    } else {
      // No passage yet (photo step not wired in this build) — bounce home.
      router.replace('/(tabs)/library' as never);
    }
  }

  // ── option card ─────────────────────────────────────────────────────────
  function Option({
    title,
    sub,
    onPress,
  }: {
    title: string;
    sub?: string;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.option,
          {
            borderColor: C.icon + '66',
            backgroundColor: pressed ? C.icon + '18' : 'transparent',
          },
        ]}>
        <ThemedText style={styles.optionTitle}>{title}</ThemedText>
        {sub ? (
          <ThemedText style={[styles.optionSub, { color: C.icon }]}>
            {sub}
          </ThemedText>
        ) : null}
      </Pressable>
    );
  }

  const target =
    feel && character ? routeFor(feel, character) : ('click-up' as ToolKey);

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* progress + back */}
      <View style={[styles.topRow, { paddingTop: insets.top + 10 }]}>
        {history.length > 0 ? (
          <Pressable onPress={back} hitSlop={8} style={styles.backBtn}>
            <ThemedText style={[styles.backText, { color: C.tint }]}>
              ‹ Back
            </ThemedText>
          </Pressable>
        ) : (
          <View style={{ width: 48 }} />
        )}
        <View style={[styles.track, { backgroundColor: C.icon + '33' }]}>
          <View
            style={[
              styles.fill,
              {
                backgroundColor: C.tint,
                width: `${(STEP_INDEX[step] / 4) * 100}%`,
              },
            ]}
          />
        </View>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {step === 'entry' && (
          <View style={styles.centered}>
            <ThemedText style={styles.h1}>Let’s work one passage.</ThemedText>
            <ThemedText style={[styles.lead, { color: C.icon }]}>
              Two quick questions and you’re practicing — nothing to set up.
            </ThemedText>
            <View style={styles.actions}>
              <Button label="Help me get started" onPress={() => go('photo')} />
              <Button
                label="I know my way around — just the tools"
                variant="ghost"
                onPress={() => router.replace('/tools' as never)}
              />
            </View>
          </View>
        )}

        {step === 'photo' && (
          <View style={styles.centered}>
            <ThemedText style={styles.h1}>
              Take a photo of the whole page.
            </ThemedText>
            <ThemedText style={[styles.lead, { color: C.icon }]}>
              Get the full page in frame — next you’ll mark the fast or technical
              spot you want to practice.
            </ThemedText>
            {/* Both options route to /upload?coach=1, which (in the coach flow)
                sends the photo into the document viewer to mark a passage box,
                then hands back to /onboarding?passageId=<id> to resume the quiz. */}
            <View style={styles.actions}>
              <Option
                title="📷  Photo of your sheet music"
                sub="paper on the stand"
                onPress={() => router.push('/upload?coach=1' as never)}
              />
              <Option
                title="🖼  Screenshot of your PDF"
                sub="from Forscore or your files"
                onPress={() => router.push('/upload?coach=1' as never)}
              />
            </View>
          </View>
        )}

        {step === 'feel' && (
          <View>
            <ThemedText style={styles.h1}>How does it feel right now?</ThemedText>
            <View style={styles.actions}>
              <Option
                title="I don’t really have it yet"
                sub="still learning the notes"
                onPress={() => {
                  setFeel('unfamiliar');
                  go('char');
                }}
              />
              <Option
                title="I can play it — needs to be more even"
                sub="clunky, uneven"
                onPress={() => {
                  setFeel('even');
                  go('char');
                }}
              />
              <Option
                title="I can play it — just need it faster"
                sub="clean slow, not up to speed"
                onPress={() => {
                  setFeel('faster');
                  go('char');
                }}
              />
              <Option
                title="One specific spot trips me up"
                sub="the rest is fine"
                onPress={() => {
                  setFeel('spot');
                  go('char');
                }}
              />
            </View>
          </View>
        )}

        {step === 'char' && (
          <View>
            <ThemedText style={styles.h1}>What does the passage look like?</ThemedText>
            <View style={styles.actions}>
              <Option
                title="A steady run of even notes"
                sub="fast 16ths, sextuplets, a scale or run"
                onPress={() => {
                  setCharacter('even');
                  go('result');
                }}
              />
              <Option
                title="A mix"
                sub="varied rhythms and rests"
                onPress={() => {
                  setCharacter('mixed');
                  go('result');
                }}
              />
            </View>
          </View>
        )}

        {step === 'result' && (
          <View style={styles.centered}>
            <ThemedText style={[styles.kicker, { color: C.icon }]}>
              YOUR FIRST SESSION
            </ThemedText>
            <ThemedText style={styles.h1}>{TOOLS[target].name}</ThemedText>
            <ThemedText style={[styles.lead, { color: C.icon }]}>
              {TOOLS[target].blurb}
            </ThemedText>
            <View style={styles.actions}>
              <Button label="Begin →" onPress={begin} />
            </View>
            <ThemedText style={[styles.note, { color: C.icon }]}>
              Already set up at a tempo you can play — just start.
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backBtn: { width: 48 },
  backText: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  body: {
    flexGrow: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  centered: { flex: 1, justifyContent: 'center', gap: Spacing.sm },
  h1: { fontSize: 24, fontWeight: Type.weight.bold, lineHeight: 30 },
  lead: { fontSize: Type.size.md, lineHeight: 22 },
  kicker: {
    fontSize: 12,
    fontWeight: Type.weight.bold,
    letterSpacing: 1,
    marginBottom: 2,
  },
  actions: { gap: Spacing.sm, marginTop: Spacing.lg },
  option: {
    borderWidth: Borders.medium,
    borderRadius: Radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 2,
  },
  optionTitle: { fontSize: Type.size.md, fontWeight: Type.weight.bold },
  optionSub: { fontSize: Type.size.sm },
  note: { fontSize: 12, marginTop: Spacing.md, lineHeight: 17 },
});
