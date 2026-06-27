import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, type ActionSheetItem } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { DocumentPageImage } from '@/components/DocumentPageImage';
import { MoveToPicker } from '@/components/MoveToPicker';
import { PromptModal } from '@/components/PromptModal';
import { useStrategyColors } from '@/components/StrategyColorsContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Colors, Fonts } from '@/constants/theme';
import { Palette } from '@/constants/palette';
import { Borders, Opacity, Overlays, Radii, Spacing, Type } from '@/constants/tokens';

// v2 reskin — Tempo-progress bar color by how close the passage is to its goal
// tempo (matches the prototype's red → amber → green gradient). Purely
// presentational; derived from the same scuPct the old "Tempo %" badge used.
function tempoBarColor(pct: number): string {
  if (pct >= 85) return Palette.success;
  if (pct >= 60) return '#E0863A';
  return Palette.danger;
}
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getFolder,
  getFolderPath,
  insertFolder,
  listAllFolders,
  listFoldersInParent,
  moveFolder,
  rehomeOrphans,
  renameFolder,
  softDeleteFolder,
  updateFolderSortOrder,
  type Folder,
} from '@/lib/db/repos/folders';
import {
  countActivePhotoPassages,
  getPassage,
  listPassages,
  listPassagesInFolder,
  movePassage,
  renamePassage,
  softDeletePassage,
  updatePassageSortOrder,
  type Passage,
} from '@/lib/db/repos/passages';
import { PaywallModal } from '@/components/PaywallModal';
import {
  FREE_PASSAGE_LIMIT,
  LOCK_BADGE_LABEL,
  LOCKED_PDF_CONTEXT_LINE,
  TRIAL_WELCOME_TITLE,
  lockedContextLine,
  trialWelcomeBody,
} from '@/constants/billing';
import { useEntitlement } from '@/lib/billing/entitlements';
import { computeLocks } from '@/lib/billing/locks';
import {
  getDocument,
  listAllDocuments,
  listDocumentsInFolder,
  moveDocument,
  parsePages,
  renameDocument,
  softDeleteDocument,
  updateDocumentSortOrder,
  type DocumentRow,
} from '@/lib/db/repos/documents';
import { countPracticeLogEntries } from '@/lib/db/repos/practiceLog';
import { getSetting, setSetting } from '@/lib/db/repos/settings';
import { getTempoLadderProgressForPassages } from '@/lib/db/repos/tempoLadder';
import { logOnboardingStep } from '@/lib/onboarding/telemetry';

type ListRow =
  | { kind: 'folder'; folder: Folder }
  | { kind: 'passage'; passage: Passage }
  | { kind: 'document'; document: DocumentRow };

type Prompt =
  | { kind: 'new_folder' }
  | { kind: 'rename_folder'; id: string; initial: string }
  | { kind: 'rename_passage'; id: string; initial: string }
  | { kind: 'rename_document'; id: string; initial: string }
  | null;

type MoveTarget =
  | { kind: 'folder'; id: string }
  | { kind: 'passage'; id: string }
  | { kind: 'document'; id: string }
  | null;

type ActionTarget =
  | { kind: 'folder'; folder: Folder }
  | { kind: 'passage'; passage: Passage }
  | { kind: 'document'; document: DocumentRow }
  | null;

type UndoMove = {
  kind: 'folder' | 'passage' | 'document';
  id: string;
  fromParent: string | null;
  label: string;
};

// v2 reskin — the ⋯ actions button shared by the cards. Opens the item's
// action sheet (rename / move / delete / reorder). Replaces the old "Edit mode"
// inline controls.
function MoreButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel="More actions"
      style={styles.moreBtn}>
      <ThemedText style={styles.moreGlyph}>⋯</ThemedText>
    </Pressable>
  );
}

// Lock-don't-lose stamp on the thumbnail of a card the free plan has locked.
// Overlay only — the card stays visible (the music isn't gone), it just can't
// be opened until the user upgrades; tapping it routes to the paywall.
function LockBadge() {
  return (
    <View style={styles.lockBadge} pointerEvents="none">
      <ThemedText style={styles.lockBadgeText}>🔒 {LOCK_BADGE_LABEL}</ThemedText>
    </View>
  );
}

type PassageCardProps = {
  passage: Passage;
  borderColor: string;
  tintColor: string;
  isPhone?: boolean;
  /** Free-plan lock-don't-lose: dim + badge the card, tap routes to paywall. */
  locked?: boolean;
  scuPct: number | null;
  // Parent location shown under the title on search results ("in <folder>").
  breadcrumb?: string | null;
  onOpen: () => void;
  onMore: () => void;
};

function PassageCard({
  passage,
  borderColor,
  tintColor,
  isPhone,
  locked,
  scuPct,
  breadcrumb,
  onOpen,
  onMore,
}: PassageCardProps) {
  const thumbStyle = isPhone ? styles.thumbPhone : styles.thumb;
  // Prefer the dedicated thumbnail, but if it fails to load (missing/broken
  // file — e.g. a cropped photo whose thumbnail file didn't get written), fall
  // back to the full source image, which is the same file the passage displays.
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumbUri =
    !thumbFailed && passage.thumbnail_uri ? passage.thumbnail_uri : passage.source_uri;
  return (
    <View style={[isPhone ? styles.cardPhone : styles.card, { borderColor }]}>
      <Pressable onPress={onOpen} onLongPress={onMore} delayLongPress={400} style={styles.cardTap}>
        {thumbUri ? (
          <Image
            source={{ uri: thumbUri }}
            style={[thumbStyle, locked && styles.lockedDim]}
            contentFit="cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <View style={[thumbStyle, { backgroundColor: tintColor + '11' }, locked && styles.lockedDim]} />
        )}
        {locked && <LockBadge />}
        <ThemedView style={styles.cardText}>
          <ThemedText type="defaultSemiBold">{passage.title}</ThemedText>
          {passage.composer && (
            <ThemedText style={{ opacity: Opacity.muted }}>{passage.composer}</ThemedText>
          )}
          {breadcrumb ? (
            <ThemedText style={[styles.breadcrumb, { color: Palette.textMuted }]} numberOfLines={1}>
              in {breadcrumb}
            </ThemedText>
          ) : null}
          {scuPct !== null && (
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${scuPct}%`, backgroundColor: tempoBarColor(scuPct) },
                  ]}
                />
              </View>
              <ThemedText style={[styles.progressPct, { color: tempoBarColor(scuPct) }]}>
                {scuPct}%
              </ThemedText>
            </View>
          )}
        </ThemedView>
      </Pressable>
      <MoreButton onPress={onMore} />
    </View>
  );
}

type DocumentCardProps = {
  document: DocumentRow;
  borderColor: string;
  tintColor: string;
  isPhone?: boolean;
  /** Free-plan lock-don't-lose: dim + badge the card, tap routes to paywall. */
  locked?: boolean;
  // Parent location shown under the title on search results ("in <folder>").
  breadcrumb?: string | null;
  onOpen: () => void;
  onMore: () => void;
};

function DocumentCard({
  document,
  borderColor,
  tintColor,
  isPhone,
  locked,
  breadcrumb,
  onOpen,
  onMore,
}: DocumentCardProps) {
  // Thumbnail = page 1. Older docs carry a stored page image; Stage-2 PDFs
  // render it from the original PDF on demand (DocumentPageImage handles both).
  // The crop is anchored to the top so the title block + tempo / key markings
  // stay visible — the middle of an orchestral part is mostly notation and
  // looks like every other middle.
  const pages = parsePages(document.pages_json);
  const firstPage = pages.length > 0 ? pages[0] : null;
  const thumbStyle = isPhone ? styles.thumbPhone : styles.thumb;
  return (
    <View style={[isPhone ? styles.cardPhone : styles.card, { borderColor }]}>
      <Pressable onPress={onOpen} onLongPress={onMore} delayLongPress={400} style={styles.cardTap}>
        {firstPage ? (
          <DocumentPageImage
            doc={document}
            page={firstPage}
            style={[thumbStyle, locked && styles.lockedDim]}
            contentFit="cover"
            contentPosition="top"
          />
        ) : (
          <View style={[thumbStyle, { backgroundColor: tintColor + '11' }, locked && styles.lockedDim]} />
        )}
        {locked && <LockBadge />}
        <ThemedView style={styles.cardText}>
          <ThemedText type="defaultSemiBold">{document.title}</ThemedText>
          {document.composer && (
            <ThemedText style={{ opacity: Opacity.muted }}>{document.composer}</ThemedText>
          )}
          <ThemedText style={{ opacity: Opacity.muted, fontSize: 12 }}>
            {document.source_kind === 'images'
              ? `Photo${document.page_count > 1 ? ` · ${document.page_count} pages` : ''}`
              : `Full part · ${document.page_count} page${document.page_count === 1 ? '' : 's'}`}
          </ThemedText>
          {breadcrumb ? (
            <ThemedText style={[styles.breadcrumb, { color: Palette.textMuted }]} numberOfLines={1}>
              in {breadcrumb}
            </ThemedText>
          ) : null}
        </ThemedView>
      </Pressable>
      <MoreButton onPress={onMore} />
    </View>
  );
}

// v2 reskin — petrol "why this app" banner shown at the library root.
function HeroBanner() {
  return (
    <View style={styles.hero}>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.heroTitle}>
          Crop the hard spots. Practice them with science-backed strategies.
        </ThemedText>
        <ThemedText style={styles.heroSub}>
          Slow, fast, deliberate, interleaved — the way the research says
          learning actually sticks.
        </ThemedText>
      </View>
      <Image
        source={require('../../assets/images/icon.png')}
        style={styles.heroIcon}
        contentFit="contain"
        accessibilityIgnoresInvertColors
        pointerEvents="none"
      />
    </View>
  );
}

// v2 reskin — section label ("Folders", "All pieces") with an optional
// right-side accessory (count or action).
function SectionHeader({
  label,
  accessory,
}: {
  label: string;
  accessory?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText style={styles.sectionLabel}>{label}</ThemedText>
      {accessory}
    </View>
  );
}

// v2 reskin — soft-tint icon variants cycled across the folder grid so the
// tiles read as a colorful set (purely presentational, keyed by position).
const FOLDER_TINTS = [
  { bg: Palette.accentSoft, fg: Palette.accent },
  { bg: Palette.rhythmicSoft, fg: Palette.rhythmic },
  { bg: Palette.interleavedSoft, fg: Palette.interleaved },
  { bg: Palette.successSoft, fg: Palette.success },
] as const;

// v2 reskin — folder rendered as a grid tile (root view). Tap to enter; the ⋯
// button (and long-press) opens the action sheet.
function FolderTile({
  name,
  count,
  tintIndex,
  onEnter,
  onMore,
}: {
  name: string;
  count: number;
  tintIndex: number;
  onEnter: () => void;
  onMore: () => void;
}) {
  const tint = FOLDER_TINTS[tintIndex % FOLDER_TINTS.length];
  return (
    <View style={styles.folderTile}>
      <Pressable
        onPress={onEnter}
        onLongPress={onMore}
        delayLongPress={400}
        style={{ gap: Spacing.sm }}>
        <View style={[styles.folderTileIcon, { backgroundColor: tint.bg }]}>
          <Feather name="folder" size={20} color={tint.fg} />
        </View>
        <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.folderTileName}>
          {name}
        </ThemedText>
        <ThemedText style={styles.folderTileMeta} numberOfLines={1}>
          {count} item{count === 1 ? '' : 's'}
        </ThemedText>
      </Pressable>
      <Pressable
        onPress={onMore}
        hitSlop={8}
        accessibilityLabel="More actions"
        style={styles.tileMore}>
        <ThemedText style={styles.moreGlyph}>⋯</ThemedText>
      </Pressable>
    </View>
  );
}

// v2 reskin — small brand-colored action that sits to the right of a section
// title (e.g. "+ New folder", "+ Add").
function SectionAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <ThemedText style={styles.sectionAction}>{label}</ThemedText>
    </Pressable>
  );
}

// Loop guard for the onboarding-seen read fallback below. Module scope so it
// survives component remounts within a single page load (but resets on a real
// reload, which deserves a fresh attempt). In a sustained outage where BOTH the
// read AND the write of `onboarding.seen` keep failing, this stops us from
// redirecting a user into onboarding over and over: we force it at most once
// per load via the error path, then assume seen.
let onboardingReadFailedThisLoad = false;

export default function LibraryScreen() {
  const router = useRouter();
  // One-time orientation overlay when the user lands here straight from
  // finishing their first guided session (finishGuidedToLibrary appends
  // ?welcome=1). NOT the big first-run "Add your first piece" tutorial — that's
  // gated on never-practiced + empty library, so it stays silent now that they
  // have a passage and a logged session.
  const welcomeParam = useLocalSearchParams<{ welcome?: string }>().welcome;
  const [showWelcome, setShowWelcome] = useState(welcomeParam === '1');
  // Final funnel milestone: landing here with ?welcome=1 means they finished a
  // full guided first session. Logged once per arrival (best-effort).
  useEffect(() => {
    if (welcomeParam === '1') void logOnboardingStep('completed');
  }, [welcomeParam]);
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { colors: strategyColors } = useStrategyColors();
  // Phone density: at narrow viewports we hide the intro copy, shrink the
  // header to icons, and use compact card art so more of the user's
  // actual library is above the fold. Either-axis check so landscape
  // phones also get the dense layout.
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  // Phone portrait gets a stacked header — title on its own row above
  // the action buttons — so a long folder/repertoire name isn't
  // ellipsized down to a few characters by the 5-button cluster on
  // the right. Phone landscape still single-rows because vertical
  // pixels are the scarce axis there.
  const isPhonePortrait = isPhone && vpH > vpW;
  // The screen draws its own header (no native nav bar), so it must clear the
  // status bar / Dynamic Island itself. The old fixed paddingTop:60 tucked the
  // folder header under the island on portrait iPhones (landscape's top inset
  // is tiny, so it looked fine there). Use the real safe-area top instead.
  const insets = useSafeAreaInsets();
  // Web has no status bar (insets.top is 0) — keep its original generous
  // spacing. Native uses the real safe-area top so the header clears the
  // Dynamic Island / status bar in portrait.
  const headerTopPad =
    Platform.OS === 'web' ? 60 : Math.max(insets.top, 12) + Spacing.sm;

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [path, setPath] = useState<Folder[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  // Whole-library lists, used only while a search query is active so a match
  // in any folder surfaces (not just the current folder). Loaded alongside
  // the folder-scoped lists in refresh().
  const [allPassages, setAllPassages] = useState<Passage[]>([]);
  const [allDocuments, setAllDocuments] = useState<DocumentRow[]>([]);
  const [scuProgress, setScuProgress] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [prompt, setPrompt] = useState<Prompt>(null);
  // Delete confirmation. On web we drive our own ConfirmModal — iPad Safari
  // silently suppresses window.confirm(), so a native dialog there returns
  // false and the delete never fires. The resolver bridges the modal's
  // button press back to the awaiting handler.
  const [confirmDel, setConfirmDel] = useState<{ label: string; message: string } | null>(null);
  const confirmDelResolver = useRef<((ok: boolean) => void) | null>(null);
  const confirmDelete = useCallback((label: string, message: string): Promise<boolean> => {
    if (Platform.OS === 'web') {
      return new Promise<boolean>((resolve) => {
        confirmDelResolver.current = resolve;
        setConfirmDel({ label, message });
      });
    }
    return new Promise((resolve) => {
      Alert.alert(`Delete "${label}"?`, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  }, []);
  const resolveConfirmDelete = useCallback((ok: boolean) => {
    confirmDelResolver.current?.(ok);
    confirmDelResolver.current = null;
    setConfirmDel(null);
  }, []);
  const [addOpen, setAddOpen] = useState(false);
  // Non-null = the paywall is up; the string is the context line explaining
  // which gate was hit. Inert while PAYWALL_ENABLED is false (isPro is
  // always true then).
  const [paywallContext, setPaywallContext] = useState<string | null>(null);
  const entitlement = useEntitlement();
  // Lock-don't-lose: which already-saved pieces are locked on the free plan.
  // Inert while the paywall is off (isPro is true → computeLocks returns empty),
  // so nothing dims or intercepts until PAYWALL_ENABLED flips and a trial ends.
  const locks = useMemo(
    () =>
      computeLocks({
        passages: allPassages,
        documents: allDocuments,
        isPro: entitlement.isPro,
      }),
    [allPassages, allDocuments, entitlement.isPro],
  );
  // One-time "welcome to your free month of Pro" banner for trial users. Web
  // only (the paywall is a web surface); dismissal persists in localStorage.
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(() => {
    if (Platform.OS !== 'web') return true;
    try {
      return localStorage.getItem('pfn:seen-trial-welcome:v1') === '1';
    } catch {
      return false;
    }
  });
  const dismissWelcome = useCallback(() => {
    try {
      localStorage.setItem('pfn:seen-trial-welcome:v1', '1');
    } catch {
      /* private mode / no storage — fine, it just shows again next load */
    }
    setWelcomeDismissed(true);
  }, []);
  // `practiceCount === null` = still loading. Gates the first-run
  // "Add your first piece" TutorialStep (practiceCount === 0).
  const [practiceCount, setPracticeCount] = useState<number | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget>(null);
  const [undoMove, setUndoMove] = useState<UndoMove | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // False until the first library fetch completes. Holds a blank screen (not
  // the empty-library hero) during the initial load so a returning user with
  // music doesn't see an empty-library flash before their pieces appear. Never
  // reset, so re-focusing the tab refreshes data in place without re-blanking.
  const [loaded, setLoaded] = useState(false);
  // Persisted "this account has already been through the first-run quiz" flag,
  // read from the per-user settings table. `null` = still loading. The demo
  // account (newbie@newbie.com) always reads null and never writes it, so it
  // re-onboards on every fresh load. Loaded per mount, so signing out and back
  // in re-evaluates it (the old module-level guard didn't — that's why the
  // demo account stopped firing the quiz until a full reload).
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);
  // Guards against a double-fire of the redirect within a single mount. Resets
  // on remount, which is correct — the persisted flag governs from then on.
  const redirectingToOnboarding = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Retry the read a couple of times first — a transient network blip on a
      // brand-new user's very first load was silently skipping onboarding (the
      // old "assume seen on error" path), dumping first-timers on a bare library.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const v = await getSetting('onboarding.seen');
          if (!cancelled) setOnboardingSeen(v === 'true');
          return;
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
        }
      }
      if (cancelled) return;
      // All reads failed. Rather than assume seen (which robs a genuinely new
      // user of onboarding), treat them as NOT-seen so the redirect effect can
      // fire — but that effect ONLY pushes onboarding for an empty, un-practiced
      // library, so existing users are never affected. The module-level guard
      // forces this at most once per load to avoid a sustained-outage loop.
      if (onboardingReadFailedThisLoad) {
        setOnboardingSeen(true);
      } else {
        onboardingReadFailedThisLoad = true;
        setOnboardingSeen(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      await rehomeOrphans();
      const [f, p, d, all, pathF, sessions, allP, allD] = await Promise.all([
        listFoldersInParent(currentFolderId),
        listPassagesInFolder(currentFolderId),
        listDocumentsInFolder(currentFolderId),
        listAllFolders(),
        getFolderPath(currentFolderId),
        // Practice-session count gates the first-run TutorialStep.
        countPracticeLogEntries(),
        // Whole-library lists for cross-folder search (B-024).
        listPassages(),
        listAllDocuments(),
      ]);
      setPracticeCount(sessions);
      setFolders(f);
      setPassages(p);
      setDocuments(d);
      setAllFolders(all);
      setAllPassages(allP);
      setAllDocuments(allD);
      setPath(pathF);
      if (p.length > 0) {
        const rows = await getTempoLadderProgressForPassages(p.map((x) => x.id));
        const map: Record<string, number> = {};
        for (const r of rows) {
          if (r.goal_tempo > 0) {
            map[r.piece_id] = Math.max(
              0,
              Math.min(100, Math.round((r.current_tempo / r.goal_tempo) * 100)),
            );
          }
        }
        setScuProgress(map);
      } else {
        setScuProgress({});
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }, [currentFolderId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const q = searchQuery.trim().toLowerCase();
  // When searching, widen the scope to the whole library so a match in any
  // folder shows up — not just the current folder (B-024). allFolders is
  // already loaded for the move-to-folder picker; allPassages / allDocuments
  // are fetched alongside in refresh().
  const sourceFolders = q ? allFolders : folders;
  const sourcePassages = q ? allPassages : passages;
  const sourceDocuments = q ? allDocuments : documents;
  const filteredFolders = q
    ? sourceFolders.filter((f) => f.name.toLowerCase().includes(q))
    : sourceFolders;
  const filteredPassages = q
    ? sourcePassages.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.composer ?? '').toLowerCase().includes(q),
      )
    : sourcePassages;
  const filteredDocuments = q
    ? sourceDocuments.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.composer ?? '').toLowerCase().includes(q),
      )
    : sourceDocuments;

  // For search results spanning folders, show where each item lives. Prefer
  // the parent document title for a passage that belongs to a PDF, else the
  // parent folder name. Only computed while searching.
  const folderNameById = new Map<string, string>();
  for (const f of allFolders) folderNameById.set(f.id, f.name);
  const documentTitleById = new Map<string, string>();
  for (const d of allDocuments) documentTitleById.set(d.id, d.title);
  function passageParentLabel(p: Passage): string | null {
    if (!q) return null;
    if (p.document_id) return documentTitleById.get(p.document_id) ?? null;
    if (p.folder_id) return folderNameById.get(p.folder_id) ?? null;
    return null;
  }
  function documentParentLabel(d: DocumentRow): string | null {
    if (!q) return null;
    if (d.folder_id) return folderNameById.get(d.folder_id) ?? null;
    return null;
  }
  const rows: ListRow[] = [
    ...filteredFolders.map((folder) => ({ kind: 'folder' as const, folder })),
    ...filteredDocuments.map((document) => ({ kind: 'document' as const, document })),
    ...filteredPassages.map((passage) => ({ kind: 'passage' as const, passage })),
  ];

  // v2 reskin — in the non-edit view folders render as a grid in the list
  // header and the FlatList scrolls only the "pieces" (documents + passages).
  // Edit mode keeps the original unified `rows` list so reordering is untouched.
  type PieceRow =
    | { kind: 'document'; document: DocumentRow }
    | { kind: 'passage'; passage: Passage };
  const pieceRows: PieceRow[] = [
    ...filteredDocuments.map((document) => ({ kind: 'document' as const, document })),
    ...filteredPassages.map((passage) => ({ kind: 'passage' as const, passage })),
  ];

  // Direct-child count for a folder card's "N items" line, computed from the
  // already-loaded whole-library lists (no extra fetch, purely presentational).
  function folderChildCount(folderId: string): number {
    let n = 0;
    for (const p of allPassages) if (p.folder_id === folderId && !p.document_id) n++;
    for (const d of allDocuments) if (d.folder_id === folderId) n++;
    for (const f of allFolders) if (f.parent_folder_id === folderId) n++;
    return n;
  }

  // First run = the very first thing a brand-new user sees is the guided quiz,
  // not an empty library. Fire once the persisted flag says "not seen", the data
  // has loaded, and the top-level library is genuinely empty + un-practiced
  // (no error, not searching, not inside a folder). We mark the flag seen
  // (best-effort) and flip local state BEFORE navigating, so the user sees the
  // quiz exactly once across sessions and devices — and a mid-quiz bail doesn't
  // restart them. The ref blocks a double-fire while this mount tears down.
  useEffect(() => {
    if (
      !redirectingToOnboarding.current &&
      onboardingSeen === false &&
      practiceCount === 0 &&
      !error &&
      !q &&
      !currentFolderId &&
      rows.length === 0
    ) {
      redirectingToOnboarding.current = true;
      setOnboardingSeen(true);
      setSetting('onboarding.seen', 'true').catch(() => {});
      router.replace('/onboarding' as never);
    }
  }, [onboardingSeen, practiceCount, error, q, currentFolderId, rows.length, router]);

  function goUp() {
    const parent = path.length >= 2 ? path[path.length - 2].id : null;
    setCurrentFolderId(parent);
  }

  function enterFolder(id: string) {
    setCurrentFolderId(id);
  }

  async function moveItem(
    kind: 'folder' | 'passage' | 'document',
    id: string,
    direction: -1 | 1,
  ) {
    const list =
      kind === 'folder'
        ? folders.map((f) => f.id)
        : kind === 'passage'
          ? passages.map((p) => p.id)
          : documents.map((d) => d.id);
    const idx = list.indexOf(id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= list.length) return;
    const reordered = [...list];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    try {
      const updateFn =
        kind === 'folder'
          ? updateFolderSortOrder
          : kind === 'passage'
            ? updatePassageSortOrder
            : updateDocumentSortOrder;
      await Promise.all(reordered.map((rid, i) => updateFn(rid, i)));
    } catch (e) {
      console.warn('[library] reorder failed', e);
    }
    refresh();
  }

  async function onPromptSubmit(value: string) {
    if (!prompt) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setPrompt(null);
      return;
    }
    if (prompt.kind === 'new_folder') {
      await insertFolder(trimmed, currentFolderId);
    } else if (prompt.kind === 'rename_folder') {
      await renameFolder(prompt.id, trimmed);
    } else if (prompt.kind === 'rename_passage') {
      await renamePassage(prompt.id, trimmed);
    } else if (prompt.kind === 'rename_document') {
      await renameDocument(prompt.id, trimmed);
    }
    setPrompt(null);
    refresh();
  }

  async function onDeleteFolder(f: Folder) {
    if (
      !(await confirmDelete(
        f.name,
        'The folder will be removed. Anything inside will move up to the parent level — nothing is deleted with it.',
      ))
    )
      return;
    softDeleteFolder(f.id).then(refresh).catch(() => undefined);
  }

  async function onDeletePassage(p: Passage) {
    if (!(await confirmDelete(p.title, 'This removes the passage from your library.'))) return;
    softDeletePassage(p.id).then(refresh).catch(() => undefined);
  }

  async function onDeleteDocument(d: DocumentRow) {
    if (
      !(await confirmDelete(
        d.title,
        'This removes the full part and any passages you marked inside it. Practice history under those passages stays in your log.',
      ))
    )
      return;
    softDeleteDocument(d.id).then(refresh).catch(() => undefined);
  }

  function destinationLabel(targetFolderId: string | null): string {
    if (targetFolderId === null) return 'Library';
    const f = allFolders.find((x) => x.id === targetFolderId);
    return f?.name ?? 'folder';
  }

  function scheduleUndoClear() {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoMove(null), 5000);
  }

  async function performMoveWithUndo(
    dragged: { kind: 'folder' | 'passage' | 'document'; id: string },
    targetFolderId: string | null,
  ) {
    let fromParent: string | null = null;
    if (dragged.kind === 'folder') {
      if (dragged.id === targetFolderId) return;
      const f = await getFolder(dragged.id);
      if (!f) return;
      fromParent = f.parent_folder_id;
      if (fromParent === targetFolderId) return;
      await moveFolder(dragged.id, targetFolderId);
    } else if (dragged.kind === 'passage') {
      const p = await getPassage(dragged.id);
      if (!p) return;
      fromParent = p.folder_id;
      if (fromParent === targetFolderId) return;
      await movePassage(dragged.id, targetFolderId);
    } else {
      const d = await getDocument(dragged.id);
      if (!d) return;
      fromParent = d.folder_id;
      if (fromParent === targetFolderId) return;
      await moveDocument(dragged.id, targetFolderId);
    }
    setUndoMove({
      kind: dragged.kind,
      id: dragged.id,
      fromParent,
      label: `Moved to ${destinationLabel(targetFolderId)}`,
    });
    scheduleUndoClear();
    refresh();
  }

  async function onUndoMove() {
    if (!undoMove) return;
    const m = undoMove;
    setUndoMove(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (m.kind === 'folder') {
      await moveFolder(m.id, m.fromParent);
    } else if (m.kind === 'passage') {
      await movePassage(m.id, m.fromParent);
    } else {
      await moveDocument(m.id, m.fromParent);
    }
    refresh();
  }

  async function onPickMove(targetId: string | null) {
    if (!moveTarget) return;
    const target = moveTarget;
    setMoveTarget(null);
    await performMoveWithUndo(target, targetId);
  }

  const disabledIdsForMove =
    moveTarget?.kind === 'folder' ? new Set([moveTarget.id]) : undefined;

  function buildActionItems(): ActionSheetItem[] {
    if (!actionTarget) return [];
    const close = () => setActionTarget(null);

    if (actionTarget.kind === 'folder') {
      const f = actionTarget.folder;
      const idx = folders.findIndex((x) => x.id === f.id);
      const items: ActionSheetItem[] = [
        {
          label: 'Rename',
          onPress: () => {
            close();
            setPrompt({ kind: 'rename_folder', id: f.id, initial: f.name });
          },
        },
        {
          label: 'Move to…',
          onPress: () => {
            close();
            setMoveTarget({ kind: 'folder', id: f.id });
          },
        },
      ];
      if (idx > 0) {
        items.push({
          label: '↑ Move up',
          onPress: () => {
            close();
            moveItem('folder', f.id, -1);
          },
        });
      }
      if (idx >= 0 && idx < folders.length - 1) {
        items.push({
          label: '↓ Move down',
          onPress: () => {
            close();
            moveItem('folder', f.id, 1);
          },
        });
      }
      items.push({
        label: 'Delete',
        destructive: true,
        onPress: () => {
          close();
          onDeleteFolder(f);
        },
      });
      return items;
    }

    if (actionTarget.kind === 'passage') {
      const p = actionTarget.passage;
      const idx = passages.findIndex((x) => x.id === p.id);
      const items: ActionSheetItem[] = [
        {
          label: 'Rename',
          onPress: () => {
            close();
            setPrompt({ kind: 'rename_passage', id: p.id, initial: p.title });
          },
        },
        {
          label: 'Move to…',
          onPress: () => {
            close();
            setMoveTarget({ kind: 'passage', id: p.id });
          },
        },
        {
          label: 'Edit / Crop',
          onPress: () => {
            close();
            router.push(`/passage/${p.id}/crop`);
          },
        },
      ];
      if (idx > 0) {
        items.push({
          label: '↑ Move up',
          onPress: () => {
            close();
            moveItem('passage', p.id, -1);
          },
        });
      }
      if (idx >= 0 && idx < passages.length - 1) {
        items.push({
          label: '↓ Move down',
          onPress: () => {
            close();
            moveItem('passage', p.id, 1);
          },
        });
      }
      items.push({
        label: 'Delete',
        destructive: true,
        onPress: () => {
          close();
          onDeletePassage(p);
        },
      });
      return items;
    }

    // document
    const d = actionTarget.document;
    const idx = documents.findIndex((x) => x.id === d.id);
    const items: ActionSheetItem[] = [
      {
        label: 'Rename',
        onPress: () => {
          close();
          setPrompt({ kind: 'rename_document', id: d.id, initial: d.title });
        },
      },
      {
        label: 'Move to…',
        onPress: () => {
          close();
          setMoveTarget({ kind: 'document', id: d.id });
        },
      },
    ];
    if (idx > 0) {
      items.push({
        label: '↑ Move up',
        onPress: () => {
          close();
          moveItem('document', d.id, -1);
        },
      });
    }
    if (idx >= 0 && idx < documents.length - 1) {
      items.push({
        label: '↓ Move down',
        onPress: () => {
          close();
          moveItem('document', d.id, 1);
        },
      });
    }
    items.push({
      label: 'Delete',
      destructive: true,
      onPress: () => {
        close();
        onDeleteDocument(d);
      },
    });
    return items;
  }

  const isAtRoot = path.length === 0;
  // v2 reskin — the root header reads "Library" (the brand sits in the eyebrow
  // above it). Inside a folder it shows the folder name, as before.
  const currentFolderName = isAtRoot ? 'Library' : path[path.length - 1].name;

  // Account entry point — lives at the bottom of the library page (replaces the
  // old ⚙ Settings button in the header). Shown as the list footer when there
  // are passages, and in the empty state so a fresh / post-reset user can still
  // reach sign-out.
  const accountFooter = (
    <View style={styles.accountFooter}>
      <Button
        label="Account"
        variant="outline"
        size="sm"
        onPress={() => router.push('/account')}
      />
    </View>
  );

  // Search scope + search box. Reused across the empty / edit / populated
  // branches so it's available in every state (e.g. to clear a search that
  // returned nothing). Behavior is unchanged from the original inline block.
  const scopeAndSearch = (
    <>
      <View style={styles.scopeRow}>
        <View style={[styles.scopeSeg, styles.scopeSegActive, { borderColor: C.tint, backgroundColor: C.tint }]}>
          <ThemedText style={[styles.scopeSegText, { color: '#fff' }]}>My Library</ThemedText>
        </View>
        <Pressable
          onPress={() =>
            router.push({ pathname: '/community', params: { q: searchQuery } })
          }
          style={[styles.scopeSeg, { borderColor: Palette.border }]}>
          <ThemedText style={[styles.scopeSegText, { color: C.text }]}>Community</ThemedText>
        </Pressable>
        {/* IMSLP scope hidden 2026-06-23 — the import flow is unreliable (broke
            the app in real use). The /imslp route + screen are left intact so
            this segment can be restored once the flow is fixed. */}
      </View>

      <View style={[styles.searchWrap, { borderColor: Palette.border }]}>
        <ThemedText style={[styles.searchIcon, { color: C.icon }]}>⌕</ThemedText>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search pieces and passages"
          placeholderTextColor={C.icon}
          style={[styles.searchInput, { color: C.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <ThemedText style={[styles.searchClear, { color: C.icon }]}>✕</ThemedText>
          </Pressable>
        )}
      </View>
    </>
  );

  // Renders one piece (document or passage) card — shared by the edit-mode
  // unified list and the non-edit pieces list.
  function renderPieceCard(item: PieceRow) {
    if (item.kind === 'document') {
      const locked = locks.lockedDocumentIds.has(item.document.id);
      return (
        <DocumentCard
          document={item.document}
          borderColor={Palette.border}
          tintColor={C.tint}
          isPhone={isPhone}
          locked={locked}
          breadcrumb={documentParentLabel(item.document)}
          onOpen={() =>
            locked
              ? setPaywallContext(LOCKED_PDF_CONTEXT_LINE)
              : router.push(`/document/${item.document.id}` as never)
          }
          onMore={() => setActionTarget({ kind: 'document', document: item.document })}
        />
      );
    }
    const locked = locks.lockedPassageIds.has(item.passage.id);
    return (
      <PassageCard
        passage={item.passage}
        borderColor={Palette.border}
        tintColor={C.tint}
        isPhone={isPhone}
        locked={locked}
        scuPct={scuProgress[item.passage.id] ?? null}
        breadcrumb={passageParentLabel(item.passage)}
        onOpen={() =>
          locked
            ? setPaywallContext(lockedContextLine())
            : router.push(`/passage/${item.passage.id}`)
        }
        onMore={() => setActionTarget({ kind: 'passage', passage: item.passage })}
      />
    );
  }

  const showFolderSection = filteredFolders.length > 0 || (isAtRoot && !q);

  // Hold a blank canvas (no empty-library chrome) while we're still deciding
  // whether to send a brand-new user straight into the quiz — either the flag
  // is still loading or it says "not seen" and the library is empty and about
  // to redirect. This is what kills the empty-library flash before the quiz.
  // Returning users with content fall through immediately (rows.length > 0),
  // and a user who already finished onboarding (onboardingSeen === true) sees
  // the normal empty-state hero if they later delete everything.
  const decidingFirstRun =
    !q &&
    !currentFolderId &&
    !error &&
    rows.length === 0 &&
    ((onboardingSeen === false && practiceCount === 0) ||
      (onboardingSeen === null && (practiceCount === null || practiceCount === 0)));

  // Initial load: hold a blank screen until the first fetch resolves, so a
  // returning user with music never sees the empty-library hero flash before
  // their pieces load in. (After the first load, `loaded` stays true, so
  // re-focusing the tab refreshes in place without blanking.)
  if (!loaded || decidingFirstRun) {
    return <ThemedView style={[styles.container, { paddingTop: headerTopPad }]} />;
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: headerTopPad }]}>
      <ThemedView
        style={[
          styles.header,
          isPhonePortrait && styles.headerStacked,
        ]}>
        <View
          style={[
            { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
            // flex:1 only in the ROW (landscape) header so the cluster takes the
            // left space. In the STACKED (portrait column) header, flex:1 means
            // grow vertically — with no spare height it collapses to 0 and the
            // title + back button disappear. In column mode alignItems:stretch
            // already gives full width, so size to content instead.
            !isPhonePortrait && { flex: 1 },
          ]}>
          {path.length > 0 && (
            <Pressable onPress={goUp} hitSlop={8} style={styles.backBtn}>
              <ThemedText style={[styles.backArrow, { color: C.tint }]}>‹</ThemedText>
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            {isAtRoot && (
              <ThemedText style={styles.eyebrow}>PLAY FAST NOTES</ThemedText>
            )}
            <ThemedText type="title" numberOfLines={1}>
              {currentFolderName}
            </ThemedText>
          </View>
        </View>
        <View
          style={[
            { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
            // Stacked layout pushes the button cluster to the right
            // edge of its own row so the visual right-aligned weight
            // of the original single-row header is preserved.
            isPhonePortrait && { justifyContent: 'flex-end' },
          ]}>
          {/* Primary action — a filled accent pill in the FIXED top bar so it's
              always visible (a plain link in the scrolling list header was easy
              to miss, especially on phone). */}
          <Pressable
            onPress={() => setAddOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Add a piece"
            style={({ pressed }) => [styles.sectionAddBtn, pressed && { opacity: 0.85 }]}>
            <Feather name="plus" size={18} color="#fff" />
            <ThemedText style={styles.sectionAddText}>Add</ThemedText>
          </Pressable>
          {/* Practice log · Rep Rotator · Tools, grouped as one chip. */}
          <View style={styles.actionGroup}>
            <Pressable
              onPress={() => {
                if (currentFolderId) {
                  router.push({
                    pathname: '/folder-log',
                    params: {
                      folderId: currentFolderId,
                      folderName: currentFolderName,
                    },
                  });
                } else {
                  router.push('/library-log');
                }
              }}
              accessibilityLabel="Practice log"
              style={styles.groupBtn}>
              <Feather name="clock" size={18} color={Palette.text} />
            </Pressable>
            <View style={styles.groupDivider} />
            <Pressable
              onPress={() => router.push('/interleaved')}
              accessibilityLabel="Rep Rotator"
              style={styles.groupBtn}>
              <Feather name="rotate-cw" size={18} color={Palette.text} />
            </Pressable>
            <View style={styles.groupDivider} />
            <Pressable
              onPress={() => router.push('/tools')}
              accessibilityLabel="Tools"
              style={styles.groupBtn}>
              <Feather name="tool" size={18} color={Palette.text} />
            </Pressable>
          </View>
        </View>
      </ThemedView>

      {error ? (
        <ThemedView style={styles.empty}>
          <ThemedText style={{ color: Palette.danger, textAlign: 'center' }}>
            Could not load your library: {error}
          </ThemedText>
          <Button label="Retry" variant="outline" size="sm" onPress={refresh} />
        </ThemedView>
      ) : rows.length === 0 ? (
        <>
          {scopeAndSearch}
          <ThemedView style={styles.empty}>
          {q || currentFolderId ? (
            <>
              <ThemedText style={{ opacity: Opacity.muted, textAlign: 'center' }}>
                {q ? 'Nothing matches that search.' : 'This folder is empty.'}
              </ThemedText>
              {!q && (
                <Button label="+ Add" size="sm" onPress={() => setAddOpen(true)} />
              )}
            </>
          ) : (
            // First-run welcome. Most new accounts never added a single
            // passage when this was a passive "create a folder" hint — the
            // first move must be the camera, not folder bookkeeping.
            <>
              <ThemedText
                style={{
                  fontSize: Type.size.xl,
                  fontWeight: Type.weight.bold,
                  textAlign: 'center',
                }}>
                Let's set up your first passage
              </ThemedText>
              <ThemedText
                style={{
                  opacity: Opacity.muted,
                  textAlign: 'center',
                  maxWidth: 420,
                }}>
                Snap a photo of the page you're working on, mark the spots you
                want to practice — one tricky spot is all it takes — and the
                practice strategies do the rest.
              </ThemedText>
              <Button
                label="📷 Add your first passage"
                onPress={() =>
                  router.push({ pathname: '/upload', params: { folder: '' } })
                }
              />
              <ThemedText style={{ opacity: Opacity.muted }}>or</ThemedText>
              <Button
                label="🛠 Try the practice tools first"
                variant="outline"
                size="sm"
                onPress={() => router.push('/tools' as never)}
              />
            </>
          )}
          {accountFooter}
          </ThemedView>
        </>
      ) : (
        <FlatList
          data={pieceRows}
          keyExtractor={(row) =>
            row.kind === 'document' ? `d:${row.document.id}` : `p:${row.passage.id}`
          }
          // Extra bottom room so the last items clear the floating info +
          // feedback buttons (each 36px tall, 16px off the bottom) when
          // scrolled all the way down.
          contentContainerStyle={{ gap: Spacing.md, paddingBottom: 80 }}
          ListHeaderComponent={
            <View style={{ gap: Spacing.lg }}>
              {isAtRoot && !q && entitlement.reason === 'trial' && !welcomeDismissed && (
                <View style={styles.welcomeCard}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.welcomeTitle}>🎉 {TRIAL_WELCOME_TITLE}</ThemedText>
                    <ThemedText style={styles.welcomeBody}>{trialWelcomeBody()}</ThemedText>
                  </View>
                  <Pressable onPress={dismissWelcome} hitSlop={8} accessibilityLabel="Dismiss">
                    <ThemedText style={styles.welcomeClose}>✕</ThemedText>
                  </Pressable>
                </View>
              )}
              {isAtRoot && !q && <HeroBanner />}
              {scopeAndSearch}
              {showFolderSection && (
                <View style={{ gap: Spacing.md }}>
                  <SectionHeader
                    label="Folders"
                    accessory={
                      isAtRoot && !q ? (
                        <SectionAction
                          label="+ Add folder"
                          onPress={() => setPrompt({ kind: 'new_folder' })}
                        />
                      ) : undefined
                    }
                  />
                  <View style={styles.folderGrid}>
                    {filteredFolders.map((folder, i) => (
                      <FolderTile
                        key={folder.id}
                        name={folder.name}
                        count={folderChildCount(folder.id)}
                        tintIndex={i}
                        onEnter={() => enterFolder(folder.id)}
                        onMore={() => setActionTarget({ kind: 'folder', folder })}
                      />
                    ))}
                  </View>
                </View>
              )}
              <SectionHeader
                label="Pieces"
                accessory={
                  <View style={styles.sectionAccessory}>
                    <ThemedText style={styles.sectionCount}>
                      {pieceRows.length}{' '}
                      {pieceRows.length === 1 ? 'piece' : 'pieces'}
                    </ThemedText>
                    {!q && (
                      <SectionAction label="+ Add piece" onPress={() => setAddOpen(true)} />
                    )}
                  </View>
                }
              />
            </View>
          }
          ListEmptyComponent={
            <ThemedText style={styles.noPieces}>
              No individual pieces here yet.
            </ThemedText>
          }
          ListFooterComponent={accountFooter}
          renderItem={({ item }) => renderPieceCard(item)}
        />
      )}

      <PromptModal
        visible={prompt !== null}
        title={
          prompt?.kind === 'new_folder'
            ? 'New folder'
            : prompt?.kind === 'rename_folder'
              ? 'Rename folder'
              : prompt?.kind === 'rename_document'
                ? 'Rename full part'
                : 'Rename passage'
        }
        initialValue={prompt && 'initial' in prompt ? prompt.initial : ''}
        placeholder={prompt?.kind === 'new_folder' ? 'Folder name' : 'New name'}
        submitLabel="Save"
        onSubmit={onPromptSubmit}
        onCancel={() => setPrompt(null)}
      />

      <ConfirmModal
        visible={confirmDel !== null}
        title={confirmDel ? `Delete "${confirmDel.label}"?` : ''}
        message={confirmDel?.message}
        confirmLabel="Delete"
        destructive
        onConfirm={() => resolveConfirmDelete(true)}
        onCancel={() => resolveConfirmDelete(false)}
      />

      <AddChooserModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onPickPassage={async () => {
          setAddOpen(false);
          if (!entitlement.isPro) {
            const n = await countActivePhotoPassages().catch(() => 0);
            if (n >= FREE_PASSAGE_LIMIT) {
              setPaywallContext(
                `The free plan includes ${FREE_PASSAGE_LIMIT} passages — you have ${n}. Go unlimited:`,
              );
              return;
            }
          }
          router.push({
            pathname: '/upload',
            params: { folder: currentFolderId ?? '' },
          });
        }}
        onPickDocument={() => {
          setAddOpen(false);
          if (!entitlement.isPro) {
            setPaywallContext('Full PDF parts are a Practice Pro feature.');
            return;
          }
          // Cast: expo-router typed routes are regenerated by the dev server;
          // until the next `playweb` start, /document-upload is not in the union.
          router.push({
            pathname: '/document-upload' as never,
            params: { folder: currentFolderId ?? '' },
          });
        }}
        onPickFolder={() => {
          setAddOpen(false);
          setPrompt({ kind: 'new_folder' });
        }}
      />

      <PaywallModal
        visible={paywallContext !== null}
        contextLine={paywallContext ?? undefined}
        onClose={() => setPaywallContext(null)}
      />

      <MoveToPicker
        visible={moveTarget !== null}
        title={
          moveTarget?.kind === 'folder'
            ? 'Move folder to…'
            : moveTarget?.kind === 'document'
              ? 'Move full part to…'
              : 'Move passage to…'
        }
        folders={allFolders}
        disabledIds={disabledIdsForMove}
        onPick={onPickMove}
        onCancel={() => setMoveTarget(null)}
      />

      <ActionSheet
        visible={actionTarget !== null}
        title={
          actionTarget?.kind === 'folder'
            ? actionTarget.folder.name
            : actionTarget?.kind === 'passage'
              ? actionTarget.passage.title
              : actionTarget?.kind === 'document'
                ? actionTarget.document.title
                : undefined
        }
        items={buildActionItems()}
        onCancel={() => setActionTarget(null)}
      />

      {/* The guided onboarding (the empty-library redirect to /onboarding)
          is now the first-run experience, so this no longer auto-fires — it
          would just flash in front of the quiz. It stays registered
          (visible={false}) so the ? button can still open it on demand. */}
      <TutorialStep
        id="library-add"
        visible={false}
        title="Your library"
        body={
          '+ Add (top right) — snap a photo of a page, upload a PDF of the full part, or make a folder. The easiest first move: a photo of the page, then mark the spots you want to practice right on it.\n\n' +
          'The icons next to + Add:\n' +
          'Clock — Practice Log: every session you\'ve logged, for this folder or the whole library.\n' +
          'Circular arrow — Rep Rotator: practice several passages in shuffled order.\n' +
          'Wrench — Tools: the metronome, tempo ladder, and rhythm variations on their own, without uploading any music.\n\n' +
          'Search — pick a scope above the box: My Library filters your own folders and passages by title or composer; Community searches rhythm exercises shared by other players (all free to browse).\n\n' +
          'Account — at the bottom of this page: sign out, reset your data, or delete your account.\n\n' +
          'On any folder, passage, or PDF card: tap to open it, or long-press for quick actions (rename, move, reorder, edit/crop, delete).'
        }
      />

      {showWelcome && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            zIndex: 200,
          }}>
          <ThemedView
            style={{ borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, gap: 12 }}>
            <ThemedText style={{ fontSize: 22, fontWeight: Type.weight.bold, textAlign: 'center' }}>
              This is your library 🎉
            </ThemedText>
            <ThemedText style={{ opacity: 0.85, textAlign: 'center' }}>
              Your passage is saved here. From now on you can:
            </ThemedText>
            <View style={{ gap: 8 }}>
              <ThemedText style={{ lineHeight: 22 }}>
                •{' '}
                <ThemedText style={{ fontWeight: Type.weight.bold }}>
                  Practice it again
                </ThemedText>{' '}
                — tap your passage, then pick any strategy.
              </ThemedText>
              <ThemedText style={{ lineHeight: 22 }}>
                •{' '}
                <ThemedText style={{ fontWeight: Type.weight.bold }}>Add another</ThemedText>{' '}
                — tap ＋ Add at the top.
              </ThemedText>
              <ThemedText style={{ lineHeight: 22 }}>
                •{' '}
                <ThemedText style={{ fontWeight: Type.weight.bold }}>Your account</ThemedText>{' '}
                — at the very bottom (sign out, settings).
              </ThemedText>
            </View>
            <Button label="Got it" onPress={() => setShowWelcome(false)} />
          </ThemedView>
        </View>
      )}

      {undoMove && (
        <View pointerEvents="box-none" style={styles.toastAnchor}>
          <View
            style={[
              styles.toast,
              {
                backgroundColor: scheme === 'dark' ? '#1f2123' : '#222',
                borderColor: C.tint,
              },
            ]}>
            <ThemedText style={styles.toastText}>{undoMove.label}</ThemedText>
            <Pressable onPress={onUndoMove} hitSlop={8} style={styles.toastBtn}>
              <ThemedText style={[styles.toastBtnText, { color: C.tint }]}>Undo</ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

function AddChooserModal({
  visible,
  onClose,
  onPickPassage,
  onPickDocument,
  onPickFolder,
}: {
  visible: boolean;
  onClose: () => void;
  onPickPassage: () => void;
  onPickDocument: () => void;
  onPickFolder: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: C.background }]}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            Add
          </ThemedText>
          <Button label="Add a photo" onPress={onPickPassage} fullWidth />
          <Button label="Add PDF" variant="outline" onPress={onPickDocument} fullWidth />
          <Button label="Add folder" variant="outline" onPress={onPickFolder} fullWidth />
          <Button label="Cancel" variant="ghost" onPress={onClose} fullWidth />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingTop: 60,
  },
  accountFooter: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  // Phone portrait override — column stacking with cross-axis stretch
  // so both the title row and the button row span the full width of
  // the screen. Reduced cross-row gap because two rows already feel
  // taller than the original single row.
  headerStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Spacing.sm,
  },
  backBtn: { paddingHorizontal: Spacing.xs },
  backArrow: { fontSize: 32, fontWeight: '400', lineHeight: 34 },
  // One-line add-content prompt at the library root. Sized like a
  // tagline (Type.size.md) rather than a hint so first-time users
  // see it as the natural next action, not as small print. Subtle
  // opacity keeps it from competing with the page title.
  addHint: {
    fontSize: Type.size.md,
    lineHeight: 22,
    opacity: Opacity.subtle,
    marginTop: -8,
    marginBottom: 4,
  },
  editHintBanner: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.xs,
    marginTop: -8,
  },
  editHintText: { fontSize: Type.size.sm, lineHeight: 18 },
  editHintSub: { fontSize: Type.size.xs, lineHeight: 15 },
  editHintBold: { fontWeight: Type.weight.heavy },
  scopeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  scopeSeg: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderWidth: Borders.thin,
    borderRadius: 16,
    // v2 reskin — inactive scopes are white chips on paper.
    backgroundColor: Palette.card,
  },
  scopeSegActive: {},
  scopeSegText: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    // v2 reskin — white search field on the paper surface.
    backgroundColor: Palette.card,
  },
  searchIcon: { fontSize: Type.size.xl, fontWeight: Type.weight.bold },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 2 },
  searchClear: { fontSize: Type.size.md, fontWeight: Type.weight.heavy },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    gap: Spacing.md,
    borderWidth: Borders.thin,
    borderRadius: Radii['2xl'],
    padding: Spacing.lg,
    alignItems: 'center',
    // v2 reskin — raised white card on the paper surface, soft low lift.
    backgroundColor: Palette.card,
    shadowColor: 'rgb(20, 30, 30)',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: Radii.sm,
    backgroundColor: '#0002',
  },
  folderIcon: {
    width: 72,
    height: 72,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Phone density: shrink the leading thumbnail / folder icon so each
  // row uses roughly half the vertical space, letting ~4–5 entries fit
  // above the fold on an iPhone instead of ~2.
  thumbPhone: {
    width: 44,
    height: 44,
    borderRadius: Radii.sm,
    backgroundColor: '#0002',
  },
  folderIconPhone: {
    width: 44,
    height: 44,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPhone: {
    flexDirection: 'row',
    gap: Spacing.sm,
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    // v2 reskin — white surface + soft lift, matching the desktop card.
    backgroundColor: Palette.card,
    shadowColor: 'rgb(20, 30, 30)',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  // Compact icon-only buttons in the phone header row.
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
    // v2 reskin — white chip on the paper header.
    backgroundColor: Palette.card,
  },
  iconBtnText: { fontSize: 18, lineHeight: 20 },
  // v2 reskin — header action buttons. Coffee = warm amber chip; the three
  // utilities (log / rep rotator / tools) share one white grouped chip.
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
  groupBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  groupDivider: { width: 1, height: 22, backgroundColor: Palette.border },
  // Transparent so the text block inherits the white card rather than the
  // themed (paper) background.
  cardText: { flex: 1, gap: Spacing.xs, backgroundColor: 'transparent' },
  // The tappable (open) region of a row card; the ⋯ button sits beside it.
  cardTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  moreBtn: {
    width: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreGlyph: { fontSize: 22, fontWeight: '700', color: Palette.textMuted, lineHeight: 22 },
  // Lock-don't-lose: a locked card reads as present-but-greyed, with a small
  // pill over the thumbnail. Not a hard block — a tap opens the paywall.
  lockedDim: { opacity: 0.4 },
  lockBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.sm,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  lockBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  tileMore: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumb: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  // v2 reskin — Tempo-progress bar (replaces the old "Tempo %" pill). 6px
  // rounded track + colored fill + tabular % readout.
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.track,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressPct: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'right',
  },
  editActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  editActionsColumn: { alignItems: 'flex-end', gap: 6 },
  editActionBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  editActionText: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },
  reorderColumn: { alignItems: 'center', gap: 2 },
  reorderBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  reorderArrow: { fontSize: Type.size.xl, fontWeight: Type.weight.heavy },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Overlays.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  toastAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.lg,
    borderWidth: Borders.thin,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    maxWidth: 420,
  },
  toastText: { color: '#fff', fontWeight: Type.weight.semibold, fontSize: Type.size.md },
  toastBtn: { paddingHorizontal: Spacing.xs, paddingVertical: 2 },
  toastBtnText: { fontWeight: Type.weight.heavy, fontSize: Type.size.md },

  // ── v2 reskin ──────────────────────────────────────────────────────────────
  eyebrow: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    fontWeight: Type.weight.bold,
    letterSpacing: 0.8,
    color: Palette.accent,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.accent,
    borderRadius: 20,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    overflow: 'hidden',
  },
  // Trial-welcome banner — teal "good news", distinct from the petrol hero.
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: '#0E7C66',
    borderRadius: 20,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  welcomeTitle: {
    fontFamily: Fonts.rounded,
    color: '#fff',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  welcomeBody: {
    color: '#FFFFFFE6',
    fontSize: Type.size.md,
    lineHeight: 19,
    marginTop: 4,
  },
  welcomeClose: {
    color: '#FFFFFFCC',
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  heroTitle: {
    fontFamily: Fonts.rounded,
    color: '#fff',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  heroSub: {
    color: '#FFFFFFD9',
    fontSize: Type.size.md,
    lineHeight: 19,
    marginTop: Spacing.sm,
  },
  // "Fast notes" motif = the real app-icon artwork (beamed notes + speed
  // lines). In-flow on the right of the hero; faded so it reads as accent art.
  heroIcon: {
    width: 140,
    height: 140,
    opacity: 0.28,
    marginRight: -16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.xl,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: Palette.text,
  },
  sectionCount: {
    fontSize: Type.size.sm,
    color: Palette.textMuted,
  },
  folderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.md,
  },
  folderTile: {
    width: '48%',
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii['2xl'],
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: 'rgb(20, 30, 30)',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  folderTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  folderTileIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderChevron: {
    fontSize: 22,
    color: Palette.textMuted,
    lineHeight: 24,
  },
  folderTileName: {
    color: Palette.text,
  },
  folderTileMeta: {
    fontSize: Type.size.sm,
    color: Palette.textMuted,
  },
  noPieces: {
    fontSize: Type.size.sm,
    color: Palette.textMuted,
    paddingVertical: Spacing.sm,
  },
  sectionAccessory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  sectionAction: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    color: Palette.accent,
  },
  sectionAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Palette.accent,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sectionAddText: {
    color: '#fff',
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
  },
});
