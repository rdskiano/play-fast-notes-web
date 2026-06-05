// Catches render/runtime errors in its subtree and shows the message on screen
// instead of a blank/closed app. Used to diagnose hard-to-reproduce native
// crashes (e.g. a screen that crashes only on a real device) — the user can
// read the error back instead of the app just disappearing.
//
// NOTE: this only catches JavaScript errors thrown during React render /
// lifecycle. A true native module crash (the app fully quits to the home
// screen) won't be caught here — that distinction itself is a useful signal.

import { Component, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type Props = {
  children: ReactNode;
  /** Shown above the error so the user knows which screen failed. */
  label?: string;
  /** Optional action row (e.g. a Go Back button). */
  onReset?: () => void;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surfaces in Metro / device logs too.
    console.error('[ErrorBoundary]', this.props.label ?? '', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText style={styles.title}>
            Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}
          </ThemedText>
          <ThemedText style={styles.hint}>
            Please screenshot this and send it over — it tells us exactly what
            broke.
          </ThemedText>
          <ThemedText style={styles.msg}>{error.message || String(error)}</ThemedText>
          {error.stack ? (
            <ThemedText style={styles.stack}>{error.stack}</ThemedText>
          ) : null}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center' },
  content: { gap: 12 },
  title: { fontSize: 20, fontWeight: '800' },
  hint: { fontSize: 14, opacity: 0.7 },
  msg: { fontSize: 15, fontWeight: '600', color: '#c0392b' },
  stack: { fontSize: 11, opacity: 0.6, fontFamily: 'Courier' },
});
