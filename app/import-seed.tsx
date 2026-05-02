import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/Button';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase/client';

type Row = Record<string, unknown>;

type SeedFile = {
  version: number;
  exported_at: number;
  tables: Record<string, Row[]>;
  files: Record<string, string>;
};

const TABLE_ORDER = [
  'folders',
  'pieces',
  'exercises',
  'sessions',
  'tempo_ladder_progress',
  'click_up_progress',
  'strategy_last_used',
  'settings',
  'practice_log',
] as const;

const WIPE_ORDER = [...TABLE_ORDER].reverse();

// Per-table column + impossible value to use as a permissive `.neq(col, val)`
// filter. Supabase requires a filter on every delete; this matches every row
// the current user can see (RLS scopes the rest).
const TABLE_FILTERS: Record<
  (typeof TABLE_ORDER)[number],
  { col: string; never: string | number }
> = {
  folders: { col: 'id', never: '__never__' },
  pieces: { col: 'id', never: '__never__' },
  exercises: { col: 'id', never: '__never__' },
  sessions: { col: 'id', never: '__never__' },
  tempo_ladder_progress: { col: 'exercise_id', never: '__never__' },
  click_up_progress: { col: 'exercise_id', never: '__never__' },
  strategy_last_used: { col: 'piece_id', never: '__never__' },
  settings: { col: 'key', never: '__never__' },
  practice_log: { col: 'id', never: -1 },
};

function decodeBase64(b64: string): ArrayBuffer {
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

function mimeFor(ext: string): string {
  const e = ext.toLowerCase();
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'pdf') return 'application/pdf';
  if (e === 'heic') return 'image/heic';
  return 'image/jpeg';
}

export default function ImportSeedScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [seed, setSeed] = useState<SeedFile | null>(null);
  const [seedName, setSeedName] = useState<string>('');
  const [wipeFirst, setWipeFirst] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  function append(line: string) {
    setLog((prev) => [...prev, line]);
  }

  function onPickFile(file: File | null | undefined) {
    if (!file) return;
    setLog([]);
    setSeed(null);
    setSeedName(file.name);
    const reader = new FileReader();
    reader.onerror = () => append(`✗ Could not read ${file.name}`);
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as SeedFile;
        if (!parsed.tables || typeof parsed.version !== 'number') {
          append('✗ File does not look like a seed export.');
          return;
        }
        setSeed(parsed);
        const counts = TABLE_ORDER.map(
          (t) => `${t}=${(parsed.tables[t] ?? []).length}`,
        ).join('  ');
        append(`Loaded ${file.name} (v${parsed.version})`);
        append(`Rows: ${counts}`);
        const fileCount = Object.keys(parsed.files ?? {}).length;
        if (fileCount === 0) {
          append(
            'Note: no image files in this seed — piece score images will be missing on web.',
          );
        } else {
          append(
            `Note: ${fileCount} image files in seed — these will be uploaded to Supabase Storage.`,
          );
        }
      } catch (e) {
        append(`✗ Could not parse JSON: ${(e as Error).message}`);
      }
    };
    reader.readAsText(file);
  }

  async function wipeAll() {
    for (const t of WIPE_ORDER) {
      const f = TABLE_FILTERS[t];
      const { error, count } = await supabase
        .from(t)
        .delete({ count: 'exact' })
        .neq(f.col, f.never as never);
      if (error) {
        append(`✗ wipe ${t}: ${error.message}`);
        throw error;
      }
      append(`  wiped ${t}: ${count ?? 0} rows`);
    }
  }

  async function uploadFile(name: string, base64: string, userId: string): Promise<string> {
    const ext = (name.split('.').pop() || 'jpg').toLowerCase();
    const mime = mimeFor(ext);
    const blob = new Blob([decodeBase64(base64)], { type: mime });
    // Preserve the basename verbatim; both source.<ext> and thumb.jpg get
    // distinct paths under <userId>/.
    const path = `${userId}/${name}`;
    const { error } = await supabase.storage.from('pieces').upload(path, blob, {
      upsert: true,
      contentType: mime,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('pieces').getPublicUrl(path);
    return data.publicUrl;
  }

  async function processPieces(
    rows: Row[],
    files: Record<string, string>,
    userId: string,
  ): Promise<Row[]> {
    const out: Row[] = [];
    for (const p of rows) {
      const next: Row = { ...p };
      for (const field of ['source_uri', 'thumbnail_uri'] as const) {
        const v = next[field];
        if (typeof v === 'string' && files[v]) {
          try {
            next[field] = await uploadFile(v, files[v], userId);
            append(`    ↑ ${v}`);
          } catch (e) {
            append(`    ↑ ${v} ✗ ${(e as Error).message}`);
            next[field] = null;
          }
        } else {
          // Unknown / stale absolute file:// path with no bytes — null out.
          next[field] = null;
        }
      }
      out.push(next);
    }
    return out;
  }

  function sanitizePlainRows(table: string, rows: Row[]): Row[] {
    return rows.map((r) => {
      const next: Row = { ...r };
      if (table === 'practice_log') {
        // bigint auto-increment — let Postgres assign a fresh id.
        delete next.id;
      }
      return next;
    });
  }

  async function importSeed() {
    if (!seed) return;
    setRunning(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        append('✗ Not signed in.');
        return;
      }
      append(`Signed in as ${sessionData.session?.user.email ?? userId}`);

      if (wipeFirst) {
        append('Wiping existing data…');
        await wipeAll();
      }

      append('Importing…');
      const seedFiles = seed.files ?? {};
      for (const t of TABLE_ORDER) {
        const rows = seed.tables[t] ?? [];
        if (rows.length === 0) {
          append(`  ${t}: 0 rows (skip)`);
          continue;
        }
        let prepared: Row[];
        if (t === 'pieces') {
          append(`  ${t}: uploading ${rows.length} pieces…`);
          prepared = await processPieces(rows, seedFiles, userId);
        } else {
          prepared = sanitizePlainRows(t, rows);
        }
        const { error } = await supabase.from(t).insert(prepared);
        if (error) {
          append(`✗ ${t}: ${error.message}`);
          throw error;
        }
        append(`  ${t}: ${prepared.length} rows ✓`);
      }

      append('');
      append('Verifying…');
      for (const t of TABLE_ORDER) {
        const { count, error } = await supabase
          .from(t)
          .select('*', { count: 'exact', head: true });
        if (error) {
          append(`  ${t}: ✗ ${error.message}`);
        } else {
          append(`  ${t}: ${count ?? 0} rows visible`);
        }
      }

      append('');
      append('Done. Open the library to see your data.');
    } catch (e) {
      append(`Aborted: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel="‹ Back"
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            Import seed
          </ThemedText>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText style={[styles.intro, { color: C.icon }]}>
          One-off tool to load an iPad seed-export.json into your Supabase data
          for testing. Image files in the seed are uploaded to Supabase Storage
          and the piece rows are rewritten to point at the public URLs.
        </ThemedText>

        <View style={[styles.card, { borderColor: C.icon + '55' }]}>
          <ThemedText style={styles.label}>1. Pick a seed file</ThemedText>
          {/* Hidden, browser-native file input — easiest path on web. */}
          <input
            type="file"
            accept="application/json"
            onChange={(e) =>
              onPickFile(
                (e.target as HTMLInputElement).files?.[0] ?? null,
              )
            }
            style={{ marginTop: 8 }}
          />
          {seedName && (
            <ThemedText style={[styles.fileName, { color: C.text }]}>
              {seedName}
            </ThemedText>
          )}
        </View>

        <View style={[styles.card, { borderColor: C.icon + '55' }]}>
          <View style={styles.rowBetween}>
            <ThemedText style={styles.label}>2. Wipe my data first</ThemedText>
            <Switch
              value={wipeFirst}
              onValueChange={setWipeFirst}
              trackColor={{ true: C.tint }}
            />
          </View>
          <ThemedText style={[styles.hint, { color: C.icon }]}>
            Recommended. Deletes every row owned by your account before
            inserting the seed. With this off, IDs in the seed may collide with
            existing rows and the import will fail mid-way.
          </ThemedText>
        </View>

        <Pressable
          disabled={!seed || running}
          onPress={importSeed}
          style={[
            styles.cta,
            {
              backgroundColor: seed && !running ? C.tint : C.icon,
              opacity: seed && !running ? 1 : 0.5,
            },
          ]}>
          <ThemedText style={styles.ctaText}>
            {running ? 'Importing…' : 'Import'}
          </ThemedText>
        </Pressable>

        {log.length > 0 && (
          <View style={[styles.logBox, { borderColor: C.icon + '55' }]}>
            {log.map((line, i) => (
              <ThemedText key={i} style={styles.logLine}>
                {line}
              </ThemedText>
            ))}
          </View>
        )}

        {!running && log.some((l) => l.startsWith('Done.')) && (
          <Button label="Open Library" onPress={() => router.replace('/library')} />
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing['2xl'] },
  intro: { fontSize: Type.size.sm, lineHeight: 18 },
  card: {
    borderWidth: Borders.thin,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  hint: { fontSize: Type.size.xs, lineHeight: 16 },
  fileName: { fontSize: Type.size.sm, marginTop: 6 },
  cta: {
    paddingVertical: Spacing.md,
    borderRadius: Radii.lg,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.lg },
  logBox: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: Spacing.md,
    gap: 2,
  },
  logLine: {
    fontFamily: 'Menlo, Consolas, monospace' as never,
    fontSize: 12,
    lineHeight: 16,
  },
});
