// First-run coach overlay for Interleaved Click-Up.
//
// The pattern users miss when they first hit Click-Up: tap NEXT after
// each rep, the tempo climbs, you keep playing the SAME unit until you
// hit performance tempo — only then do the triangles move. New users
// repeatedly tap NEXT thinking nothing's happening because the only
// thing changing is the BPM number. This one-shot modal teaches the
// loop on first entry to the playing phase.
//
// Styled to match the rest of the coaching layer (guided tour + the "?"
// help modal): a dark slate panel with the site-orange accent, so all the
// onboarding surfaces read as one family.
//
// Persistence is via the cross-platform settings repo, so dismissing
// on web also dismisses on iPad (and vice versa) for the same user.

import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing, Type } from '@/constants/tokens';
import { getSetting, setSetting } from '@/lib/db/repos/settings';

const COACH_KEY = 'clickUp.coachSeen';

// Shared coaching palette (matches HelpModal + TourContext).
const CARD_BG = '#1e293b';
const CARD_TITLE = '#f8fafc';
const CARD_BODY = '#cbd5e1';
const ACCENT = '#e67e22'; // site orange

export function ClickUpCoach() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSetting(COACH_KEY)
      .then((v) => {
        if (cancelled) return;
        if (v !== '1') setOpen(true);
      })
      .catch(() => {
        // Settings read failed (no DB yet, network blip on web). Fail
        // open — the user dismisses once and we'll persist on close.
        if (!cancelled) setOpen(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function close() {
    setOpen(false);
    setSetting(COACH_KEY, '1').catch(() => {
      // If we can't persist, the coach will show again next session —
      // mildly annoying but not broken.
    });
  }

  return (
    <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ThemedText type="subtitle" style={styles.title}>
            How Click-Up works
          </ThemedText>
          <ThemedText style={styles.body}>
            Play the unit (between the two triangles ▼), then tap Next. The
            tempo climbs each rep. Keep playing between the green arrows as they
            move. Tap Back if you need to redo the previous step. The session
            logs automatically when you finish, or tap DONE to log early.
          </ThemedText>
          <Pressable
            onPress={close}
            style={styles.btn}
            accessibilityRole="button">
            <ThemedText style={styles.btnText}>Got it</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radii.xl,
    borderWidth: 1,
    backgroundColor: CARD_BG,
    borderColor: ACCENT + '55',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  title: {
    textAlign: 'center',
    color: CARD_TITLE,
  },
  body: {
    fontSize: Type.size.md,
    textAlign: 'center',
    lineHeight: 22,
    color: CARD_BODY,
  },
  btn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    alignSelf: 'center',
    minWidth: 140,
    alignItems: 'center',
    backgroundColor: ACCENT,
  },
  btnText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.sm,
  },
});
