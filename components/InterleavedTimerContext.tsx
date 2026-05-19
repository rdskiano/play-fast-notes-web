import { useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing, Type } from '@/constants/tokens';
import {
  advanceActiveSession,
  getActiveSession,
} from '@/hooks/useInterleavedSession';

type TimerState = {
  active: boolean;
  secondsLeft: number;
  expired: boolean;
  passageTitle: string;
};

type TimerApi = {
  startTimer: (minutes: number, passageTitle: string) => void;
  stopTimer: () => void;
};

const Ctx = createContext<(TimerState & TimerApi) | null>(null);

export function useInterleavedTimer() {
  return useContext(Ctx);
}

export function InterleavedTimerProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [expired, setExpired] = useState(false);
  const [passageTitle, setPassageTitle] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (minutes: number, title: string) => {
      clearTimer();
      setSecondsLeft(minutes * 60);
      setExpired(false);
      setPassageTitle(title);
      setActive(true);
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearTimer();
            setExpired(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clearTimer],
  );

  const stopTimer = useCallback(() => {
    clearTimer();
    setActive(false);
    setExpired(false);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const value = {
    active,
    secondsLeft,
    expired,
    passageTitle,
    startTimer,
    stopTimer,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function InterleavedStatusBar() {
  const timer = useInterleavedTimer();
  const router = useRouter();
  if (!timer || !timer.active) return null;

  const mm = Math.floor(timer.secondsLeft / 60);
  const ss = String(timer.secondsLeft % 60).padStart(2, '0');

  function handleNext() {
    if (!timer) return;
    advanceActiveSession();
    const session = getActiveSession();
    if (session?.celebrating) {
      timer.stopTimer();
    }
    router.dismissAll();
    router.push({ pathname: '/interleaved', params: { resume: '1' } });
  }

  return (
    <View
      style={[
        styles.statusBar,
        { backgroundColor: timer.expired ? '#c0392b' : '#7b2d00' },
      ]}>
      <ThemedText style={styles.statusTimer}>
        {timer.expired ? "Time's up" : `${mm}:${ss}`}
      </ThemedText>
      <View style={styles.statusDot} />
      <ThemedText style={styles.statusTitle} numberOfLines={1}>
        {timer.passageTitle}
      </ThemedText>
      <Pressable onPress={handleNext} hitSlop={8} style={styles.statusNext}>
        <ThemedText style={styles.statusNextText}>Next Serial passage →</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  statusTimer: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: 15,
  },
  statusDot: {
    width: Spacing.xs,
    height: Spacing.xs,
    borderRadius: 2,
    backgroundColor: '#ffffff66',
  },
  statusTitle: {
    flex: 1,
    color: '#fff',
    fontWeight: Type.weight.semibold,
    fontSize: Type.size.sm,
  },
  statusNext: {
    backgroundColor: '#ffffff33',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radii.md,
  },
  statusNextText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.sm,
  },
});
