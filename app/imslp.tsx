// IMSLP search + guided import. Search runs in-app (via the imslp-search edge
// proxy); the DOWNLOAD is a user-driven handoff to IMSLP's own page, because
// IMSLP deliberately gates downloads (disclaimer + ~15s timer) and forbids
// bot-fetching them. Tapping a result opens the IMSLP work page AND routes the
// user to "Add a full part" with title/composer prefilled, so once they've
// downloaded the PDF they pick it and it imports cleanly. Mirrors how Newzik
// and forScore do it — the only ToS-clean, robust pattern.
//
// Searching is free (the funnel); importing a full part is Pro (it's a PDF
// document), so the import handoff is Pro-gated.

import Feather from '@expo/vector-icons/Feather';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Linking, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PaywallModal } from '@/components/PaywallModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Lift } from '@/constants/palette';
import { Fonts } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useEntitlement } from '@/lib/billing/entitlements';
import { searchImslp, type ImslpResult } from '@/lib/imslp/search';

function openExternal(url: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.open(url, '_blank');
  } else {
    void Linking.openURL(url);
  }
}

export default function ImslpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerTopPad = Platform.OS === 'web' ? 56 : Math.max(insets.top, 12) + Spacing.sm;
  const params = useLocalSearchParams<{ q?: string }>();
  const entitlement = useEntitlement();

  const [query, setQuery] = useState(params.q ?? '');
  const [results, setResults] = useState<ImslpResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const handle = setTimeout(() => {
      searchImslp(q)
        .then((r) => {
          if (!alive) return;
          setResults(r);
          setError(null);
          setSearched(true);
        })
        .catch((e) => {
          if (alive) setError(e instanceof Error ? e.message : 'Search failed.');
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [query]);

  function onImport(r: ImslpResult) {
    if (!entitlement.isPro) {
      setPaywall(true);
      return;
    }
    // Open IMSLP's work page so the user accepts the disclaimer and downloads,
    // and route to the importer with the work's title/composer prefilled.
    openExternal(r.pageUrl);
    router.push({
      pathname: '/document-upload' as never,
      params: {
        title: r.work,
        composer: r.composer ?? '',
        imslp: '1',
        folder: '',
      },
    });
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: headerTopPad }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText style={styles.backLink}>‹ Library</ThemedText>
        </Pressable>
        <ThemedText type="title">IMSLP</ThemedText>
      </View>

      <View style={[styles.searchWrap, { borderColor: Palette.border }]}>
        <Feather name="search" size={18} color={Palette.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search composer and work, e.g. Brahms Symphony 4"
          placeholderTextColor={Palette.textMuted}
          style={[styles.searchInput, { color: Palette.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Feather name="x" size={18} color={Palette.textMuted} />
          </Pressable>
        )}
      </View>

      <ThemedText style={styles.intro}>
        Free public-domain sheet music from IMSLP. Pick a work to open it on
        IMSLP, download the PDF there, and it imports into your library.
      </ThemedText>

      {error ? (
        <View style={styles.empty}>
          <ThemedText style={{ color: Palette.danger, textAlign: 'center' }}>{error}</ThemedText>
        </View>
      ) : loading ? (
        <View style={styles.empty}>
          <ThemedText style={{ opacity: Opacity.muted }}>Searching IMSLP…</ThemedText>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={{ opacity: Opacity.muted, textAlign: 'center' }}>
            {searched
              ? 'No matches on IMSLP. Try the composer’s surname plus the work.'
              : 'Type a composer and work to search IMSLP.'}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r) => r.title}
          contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xl }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onImport(item)}
              style={[styles.card, { borderColor: Palette.border }]}>
              <ThemedText type="defaultSemiBold" style={styles.cardTitle} numberOfLines={2}>
                {item.work}
              </ThemedText>
              {item.composer ? (
                <ThemedText style={styles.cardMeta} numberOfLines={1}>
                  {item.composer}
                </ThemedText>
              ) : null}
              <ThemedText style={styles.cardCta}>
                Open on IMSLP & import →
              </ThemedText>
            </Pressable>
          )}
        />
      )}

      <PaywallModal
        visible={paywall}
        contextLine="Importing full parts (including from IMSLP) is a Practice Pro feature. Searching is free."
        onClose={() => setPaywall(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  backLink: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
    color: Palette.accent,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    backgroundColor: Palette.card,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 12 },
  intro: {
    fontSize: Type.size.sm,
    color: Palette.textSecondary,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    lineHeight: 19,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  card: {
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    gap: 3,
    backgroundColor: Palette.card,
    ...Lift,
  },
  cardTitle: { fontFamily: Fonts.rounded, color: Palette.text },
  cardMeta: { fontSize: Type.size.sm, color: Palette.textSecondary },
  cardCta: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    color: Palette.accent,
    marginTop: 4,
  },
});
