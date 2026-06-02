# Cluster 1: Timer settings cleanup + Cold passage picker

Bugs covered: **B-003**, **B-005**, **B-012**, **B-013**, **B-014** from `BUGS.md`.

Friend-test surfaced five timer-area bugs that all cluster in the same code path. Fix them together so the in-tool Timer Settings sheet, the Library Settings page, and the Cold picker land as one coherent surface.

## Files to read before starting

- `components/GlobalTimerTray.tsx` — owns `PracticeTimersPill`, `TimerSettingsModal`, `ChipRow`, `ToggleRow`. This is where most of the work lives.
- `components/PracticeToolsLayer.tsx` — renders the Timer `ToolDock`; the activity indicator goes here.
- `components/ToolDock.tsx` — to know what hooks the indicator can use. May need a new prop.
- `components/PracticeTimersContext.tsx` — `PlayItColdConfig` shape (`enabled`, `intervalMin`, `intervalMax`, `pieceId`). Don't change this.
- `components/PassagePickerModal.tsx` — currently groups passages by folder + "Unfiled" only.
- `app/settings.tsx` — the library-level full Cold config (Steppers + min/max + passage picker). Source the verbose labels from here.
- `lib/db/repos/passages.ts` — confirm `Passage` has `document_id`, `folder_id`, `title`, `composer`. Used to build the new picker sections.
- `lib/db/repos/documents.ts` (or equivalent) — confirm there's a `listDocuments()` / `getDocument()` to fetch parent PDF titles.

## What changes for users

**B-014 — Cold gets a row in the in-tool Timer Settings sheet.** Currently the in-tool sheet has Rotate, Micro, and Break only, and there's an apology footer saying Cold lives in the Library settings. Cold gets its own row: toggle + Min / Max interval chips + a "Passage" button that opens the existing `PassagePickerModal`. The apology footer is removed.

**B-013 — Timer settings labels distinguish interval from duration.** In the in-tool sheet today, Rotate / Micro / Break all show a `ChipRow` with a unit ("min" or "s") but no preposition, so users can't tell whether the number means "fire every N" or "the rest lasts N." Each chip row gets a preceding word: **"Fire every"** for interval timers (Rotate, Break, Cold Min, Cold Max), **"Rest for"** for Micro. Matches the verbose labels already in `app/settings.tsx`.

**B-003 — The in-tool sheet and the Library Settings page use the same vocabulary.** Library Settings says "Fire every / Break length / Min interval / Max interval / Passage." In-tool should match: "Fire every / Rest for / Min interval / Max interval / Passage." Same labels in the same order. Removes the cognitive cost of switching between surfaces.

**B-005 — The Timer tool tab shows a small lit indicator when any timer is enabled.** Today the Timer `ToolDock` tab looks identical whether all four timers are off or all four are on. Add a small orange dot to the tab when `(moveOn || microbreak || playItCold || bodyMove).config.enabled === true` for any of the four. Same orange (`DEVICE.accent`) as the lit timer keys, so the visual language matches.

**B-012 — Play It Cold picker disambiguates passages by their parent.** Today `PassagePickerModal` groups by folder only, and every passage without a folder lands under "Unfiled" as a flat list. For a user who works mostly from PDFs (cropped passages with auto-titles like "measure 43"), this picker is unusable — they see "measure 43" repeated dozens of times with no way to tell them apart. The fix: group passages by their **parent document** first, then by folder, then a final "Loose passages" section for everything that has neither. Each section header is the PDF title or folder name. Within a PDF section, optionally show the page number ("p. 4") next to the title.

## Code-level changes

### `components/GlobalTimerTray.tsx`

**Imports.** `usePlayItColdTimer` already imported — keep. The Cold row will reuse the existing `PassagePickerModal` already imported.

**`MOVE_ON_INTERVAL_OPTS` / `BODY_MOVE_INTERVAL_OPTS` / `MICROBREAK_SECONDS_OPTS`.** Leave as-is. Add two new constants for Cold:

```ts
const COLD_MIN_INTERVAL_OPTS = [2, 3, 5, 8, 10] as const;
const COLD_MAX_INTERVAL_OPTS = [5, 10, 15, 20, 30] as const;
```

These mirror the Library Settings' Stepper range (`min={2} max={15}` for min interval; `min={2} max={15}` for max — but the chip set is smaller, picked for compactness; Library Settings can stay as Steppers for fine-grained control). If `pieceId` is null when the user toggles Cold on, open the existing `PassagePickerModal` first; only flip `enabled` after a pick.

**`ChipRow` component.** Add an optional `prefix` prop (e.g. `"Fire every"`, `"Rest for"`, `"Min interval"`). Render it as a small label above the chip row, with the same `paddingLeft: 36` the existing `chipRow` style uses, so the prefix and chips share the indent. The unit suffix on each chip stays as it is.

```tsx
function ChipRow<T extends number>({
  options, value, onChange, unit, disabled, prefix,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  unit: string;
  disabled?: boolean;
  prefix?: string;
}) {
  // ...existing scheme + render...
  return (
    <View style={[disabled && { opacity: 0.4 }]}>
      {prefix && (
        <ThemedText style={[styles.chipPrefix, { color: C.icon }]}>{prefix}</ThemedText>
      )}
      <View style={styles.chipRow}>
        {/* existing chip map */}
      </View>
    </View>
  );
}
```

Add to the stylesheet:

```ts
chipPrefix: {
  fontSize: 12,
  fontWeight: Type.weight.semibold,
  paddingLeft: 36,
  paddingBottom: 4,
},
```

**`TimerSettingsModal`.** Bring in `playItCold` via `usePlayItColdTimer()`. Add a `pickerOpen` state inside the modal. Add a Cold settings block between Micro and Break (matches the order on the in-tool pill: Rotate / Micro / Cold / Break):

```tsx
<View style={styles.settingsBlock}>
  <ToggleRow
    icon="❄️"
    title="Cold"
    subtitle="Surprise performance during practice"
    enabled={playItCold.config.enabled}
    onToggle={() => {
      if (!playItCold.config.enabled && !playItCold.config.pieceId) {
        setPickerOpen(true);
        return;
      }
      playItCold.setConfig({ enabled: !playItCold.config.enabled });
    }}
  />
  <ChipRow
    options={COLD_MIN_INTERVAL_OPTS}
    value={
      (COLD_MIN_INTERVAL_OPTS.find((v) => v === playItCold.config.intervalMin)
        ?? COLD_MIN_INTERVAL_OPTS[1]) as (typeof COLD_MIN_INTERVAL_OPTS)[number]
    }
    onChange={(v) => playItCold.setConfig({ intervalMin: v })}
    unit=" min"
    prefix="Min interval"
    disabled={!playItCold.config.enabled}
  />
  <ChipRow
    options={COLD_MAX_INTERVAL_OPTS}
    value={
      (COLD_MAX_INTERVAL_OPTS.find((v) => v === playItCold.config.intervalMax)
        ?? COLD_MAX_INTERVAL_OPTS[1]) as (typeof COLD_MAX_INTERVAL_OPTS)[number]
    }
    onChange={(v) => playItCold.setConfig({ intervalMax: v })}
    unit=" min"
    prefix="Max interval"
    disabled={!playItCold.config.enabled}
  />
  <View style={styles.coldPassageRow}>
    <ThemedText style={[styles.coldPassageLabel, { color: C.icon }]}>Passage</ThemedText>
    <Pressable
      onPress={() => setPickerOpen(true)}
      style={[styles.coldPickBtn, { borderColor: C.icon }]}>
      <ThemedText style={[styles.coldPickBtnText, { color: C.text }]} numberOfLines={1}>
        {playItCold.passage?.title ?? 'Pick a passage…'}
      </ThemedText>
    </Pressable>
  </View>
</View>
```

Add the picker modal render at the end of the `TimerSettingsModal` return (inside the outer `<Modal>` wrapper if nesting works on the target platforms; otherwise pull it out alongside):

```tsx
<PassagePickerModal
  visible={pickerOpen}
  selectedId={playItCold.config.pieceId}
  onClose={() => setPickerOpen(false)}
  onPick={(pieceId) => {
    playItCold.setConfig({ enabled: true, pieceId });
    setPickerOpen(false);
  }}
  title="Pick a Play-It-Cold passage"
/>
```

Add the four prefixes to existing rows:
- Rotate: `prefix="Fire every"`
- Micro: `prefix="Rest for"`
- Break: `prefix="Fire every"`

**Footer.** Delete the apologetic footer text that starts with `"Cold config (interval range + passage) still lives under ⚙ Settings in the library…"`. Cold is now in the in-tool sheet.

**Stylesheet additions:**

```ts
coldPassageRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  paddingLeft: 36,
},
coldPassageLabel: {
  fontSize: 12,
  fontWeight: Type.weight.semibold,
  width: 60,
},
coldPickBtn: {
  flex: 1,
  borderWidth: Borders.thin,
  borderRadius: Radii.md,
  paddingHorizontal: Spacing.md,
  paddingVertical: Spacing.sm,
},
coldPickBtnText: {
  fontWeight: Type.weight.semibold,
  fontSize: Type.size.sm,
},
```

### `components/PracticeToolsLayer.tsx`

**Activity indicator on the Timer tab.** Bring in the four timer hooks at the top of `PracticeToolsLayer`:

```tsx
import { useMoveOnTimer, useMicrobreakTimer, usePlayItColdTimer, useBodyMoveTimer } from '@/components/PracticeTimersContext';
```

Inside the component:

```tsx
const moveOnEnabled = useMoveOnTimer().config.enabled;
const microbreakEnabled = useMicrobreakTimer().config.enabled;
const coldEnabled = usePlayItColdTimer().config.enabled;
const bodyMoveEnabled = useBodyMoveTimer().config.enabled;
const anyTimerOn = moveOnEnabled || microbreakEnabled || coldEnabled || bodyMoveEnabled;
```

In the `case 'timer':` branch, pass a new `indicator` prop to `ToolDock`:

```tsx
<ToolDock
  {...common}
  key={dockKey}
  edge={edge}
  label={label}
  accent={DEVICE.body}
  panelBg={TIMER_DEVICE.body}
  borderColor={TIMER_DEVICE.rim}
  tabTop={tabTop}
  tabSpan={span}
  indicator={anyTimerOn ? DEVICE.accent : undefined}
  panelWidth={360}
  panelHeight={132}>
  ...
</ToolDock>
```

### `components/ToolDock.tsx`

Add an optional `indicator?: string` prop to the component's props type. When defined, render a small absolutely-positioned dot on the tab — 8 px circle, in the indicator color, top-right corner of the tab for `right` edge, top-left for `left` edge. ~4 px inset from the corner. Keep the existing tab visuals untouched when `indicator` is `undefined`.

```tsx
{indicator && (
  <View
    pointerEvents="none"
    style={{
      position: 'absolute',
      top: 4,
      [edge === 'right' ? 'left' : 'right']: 4,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: indicator,
    }}
  />
)}
```

### `components/PassagePickerModal.tsx`

This is the biggest change. The picker today groups by folder + "Unfiled." Replace the `sections` `useMemo` with grouping by document first, then folder, then a final loose section.

**New data load.** Also load documents:

```ts
import { listDocuments, type Document } from '@/lib/db/repos/documents';
const [documents, setDocuments] = useState<Document[]>([]);

useEffect(() => {
  if (!visible) return;
  (async () => {
    const [p, f, d] = await Promise.all([listPassages(), listAllFolders(), listDocuments()]);
    setPassages(p);
    setFolders(f);
    setDocuments(d);
  })();
}, [visible]);
```

If `listDocuments` doesn't exist, write it. Should return `{ id, title, ... }[]`. Check `lib/db/repos/documents.{ts,web.ts}` — if there's a different listing function, use that.

**New grouping.** Replace the existing `sections` `useMemo`:

```ts
type Section = { title: string; subtitle?: string; items: { passage: Passage; pageHint?: string }[] };

const sections = useMemo(() => {
  const byDocument = new Map<string, Passage[]>();
  const byFolder = new Map<string, Passage[]>();
  const loose: Passage[] = [];
  for (const p of passages) {
    if (p.document_id) {
      if (!byDocument.has(p.document_id)) byDocument.set(p.document_id, []);
      byDocument.get(p.document_id)!.push(p);
    } else if (p.folder_id) {
      if (!byFolder.has(p.folder_id)) byFolder.set(p.folder_id, []);
      byFolder.get(p.folder_id)!.push(p);
    } else {
      loose.push(p);
    }
  }
  const out: Section[] = [];
  // Documents first — that's the primary workflow.
  for (const d of documents) {
    const list = byDocument.get(d.id);
    if (!list || list.length === 0) continue;
    out.push({
      title: d.title,
      subtitle: list.length === 1 ? '1 passage' : `${list.length} passages`,
      items: list.map((p) => ({
        passage: p,
        pageHint: extractPageHint(p), // see helper below
      })),
    });
  }
  // Folders next.
  for (const f of folders) {
    const list = byFolder.get(f.id);
    if (!list || list.length === 0) continue;
    out.push({
      title: f.name,
      items: list.map((p) => ({ passage: p })),
    });
  }
  // Loose last. Renamed from "Unfiled" — friendlier, less programmer-y (B-001 spirit).
  if (loose.length > 0) {
    out.push({ title: 'Loose passages', items: loose.map((p) => ({ passage: p })) });
  }
  return out;
}, [passages, folders, documents]);
```

**Page hint helper.** A small helper at module scope that pulls a "p. N" string from a passage's `regions_json` if present:

```ts
function extractPageHint(p: Passage): string | undefined {
  if (!p.regions_json) return undefined;
  try {
    const regions = typeof p.regions_json === 'string'
      ? JSON.parse(p.regions_json)
      : p.regions_json;
    if (Array.isArray(regions) && regions.length > 0 && typeof regions[0].page === 'number') {
      const minPage = Math.min(...regions.map((r: any) => Number(r.page)).filter(Number.isFinite));
      return Number.isFinite(minPage) ? `p. ${minPage + 1}` : undefined;
    }
  } catch {}
  return undefined;
}
```

If `Passage` doesn't expose `regions_json` directly, either add it to the select in `lib/db/repos/passages.ts` (both `.ts` and `.web.ts` siblings — keep their signatures identical) or skip the page hint as a v2 follow-up.

**Render update.** Inside the section map, render the subtitle and the page hint:

```tsx
<ThemedText style={styles.folderHeader}>{s.title}</ThemedText>
{s.subtitle && (
  <ThemedText style={[styles.folderSubtitle, { color: C.icon }]}>{s.subtitle}</ThemedText>
)}
{s.items.map(({ passage: p, pageHint }) => {
  // ...existing row, but show pageHint next to the title:
  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
    <ThemedText style={styles.title} numberOfLines={1}>{p.title}</ThemedText>
    {pageHint && (
      <ThemedText style={[styles.pageHint, { color: C.icon }]}>{pageHint}</ThemedText>
    )}
  </View>
  // ...
})}
```

Add to the stylesheet:

```ts
folderSubtitle: { fontSize: 12, marginTop: -2 },
pageHint: { fontSize: 12, fontWeight: Type.weight.semibold },
```

## Copy to use verbatim

In-tool TimerSettingsModal labels — order top to bottom:

- Rotate: title `"Rotate"`, subtitle `"Switch passages on a schedule"`, prefix `"Fire every"`, unit `" min"`
- Micro: title `"Micro"`, subtitle `"Short rest after sets of clean reps"`, prefix `"Rest for"`, unit `" s"`
- Cold (new): title `"Cold"`, subtitle `"Surprise performance during practice"`, prefixes `"Min interval"` / `"Max interval"`, unit `" min"`, passage button label `"Pick a passage…"` (when empty) or the passage title
- Break: title `"Break"`, subtitle `"Get up, stretch, walk around"`, prefix `"Fire every"`, unit `" min"`

Loose section header in `PassagePickerModal`: `"Loose passages"` (not "Unfiled").

## Test plan (run on `playweb` before pushing)

1. Sign in. Open any passage. Pop out the Timer tool tab. Tab has no orange dot. Open the sheet.
2. See four rows: Rotate / Micro / Cold / Break, in that order. Each has the new prefix label above its chip row.
3. Toggle Rotate on → close the sheet → tab now has the orange dot.
4. Toggle Rotate off → dot disappears.
5. Toggle Cold on with no passage previously picked → the `PassagePickerModal` opens. Cancel without picking → Cold stays off. Open again, pick a passage → Cold turns on, the passage button shows the title.
6. Open the picker via the Passage button (not via the toggle). Verify:
   - Each PDF document with passages renders as a section with the PDF title and `"N passages"` subtitle.
   - Each folder with non-document passages renders as a section.
   - True loose passages render under `"Loose passages"`.
   - PDF passages show a small `"p. N"` next to their title (when `regions_json` decodes).
7. Pick a passage inside a PDF section. Modal closes. Cold's row shows the new title.
8. Open Library `⚙ Settings → Practice timers`. Verify the verbose labels are still there ("Fire every", "Break length", "Min interval", "Max interval", "Passage") — the in-tool sheet now matches the library wording.
9. Reload the page. All four timer toggles + Cold pieceId persist (localStorage key tests).
10. Sign out, sign in as a different account → no Cold pieceId leak.

## What stays unchanged

- `PracticeTimersContext.tsx` data model. `PlayItColdConfig` shape stays the same — `enabled`, `intervalMin`, `intervalMax`, `pieceId`. The storage keys (`timers.moveOn`, `timers.microbreak`, `timers.playItCold`, `timers.bodyMove`) stay so existing users' prefs carry forward.
- The firing scheduler in `PracticeTimersProvider`. The intervals you chose still feed into `setInterval(... , intervalMin * 60_000)` etc. without change.
- `app/settings.tsx` — leave the Library Settings full Cold config alone. It's the place for fine-grained Steppers and stays in addition to the in-tool sheet. The user can use whichever they prefer.
- `TimerInfoModal` (the `?` help modal). The 4-row info content is correct.
- The Rep Rotator `PassagePicker.tsx` (different file from `PassagePickerModal.tsx`). That picker is for Rep Rotator's drill-in browsing and isn't touched by this change.

## After it ships

Mark B-003, B-005, B-012, B-013, B-014 as fixed in `BUGS.md` once you've verified them on laptop-web. Re-verify on iphone-web and iPad surfaces when those surface walks happen. The Timer indicator dot in particular should be verified on iPad-native after iPad cutover lands, since the `ToolDock` rendering can diverge between platforms.
