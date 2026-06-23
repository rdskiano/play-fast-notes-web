# Play Fast Notes — Design Consistency Rules

A spec for a consistency sweep. Apply these as global rules; **change only styling/markup, never behavior, data, or logic.** When a screen already follows a rule, leave it. Prefer fixing shared components/tokens over editing screens one by one.

---

## 1. Color tokens

Define these once (theme/tokens file) and replace ad-hoc hex values app-wide with the token.

```
/* Surfaces */
--paper:        #F6F2EC;   /* app background */
--surface:      #FFFFFF;   /* cards, sheets */
--surface-sunk: #F4F1EA;   /* inset wells, segmented tracks, secondary chips */

/* Ink / text */
--ink:          #15191A;   /* primary text, headings */
--ink-muted:    #6B7375;   /* body / secondary */
--ink-faint:    #9AA0A1;   /* captions, meta, placeholders */

/* Borders */
--border:       #ECE6DC;   /* default hairline on cards/chips */
--border-strong:#E4DED3;   /* on sunk/secondary surfaces */

/* Brand accent (petrol) */
--accent:       #0A7598;
--accent-deep:  #075A77;   /* gradients / pressed */
--accent-soft:  #E1EFF4;   /* tinted backgrounds, soft chips */

/* Semantic */
--success:      #2E9C66;  --success-soft: #E4F2EA;
--danger:       #D9523E;  --danger-soft:  #FBEAE6;  --danger-ghost-border: #E2A99B;
--warn:         #E0863A;  --warn-soft:    #F8ECDD;
```

**Rules**
- The **only** brand color is petrol `--accent`. No other blue/teal hexes. Primary buttons, links, active tabs, focus rings, the info button = `--accent`.
- **One destructive red** everywhere: `--danger` (`#D9523E`). Delete the brick/rust reds (`#C0392B`, `#B5432F`, etc.) and any other red variants.
- Never invent new hexes. If you need a tint, use the matching `*-soft` token.

## 2. Two color *languages* — don't mix them

Color carries exactly one meaning in any given place:

- **Strategy = which practice method** (categorical). Fixed hue per strategy, used on strategy cards, the live session, and the practice log only:
  - Tempo Ladder `#2E9C66` / soft `#E4F2EA`
  - Interleaved Click-Up `#0A7598` / `#E1EFF4`
  - Rhythmic Variation `#7657C8` / `#EEE9F8`
  - Micro-Chaining `#3F5BD9` / `#E7EAFB`
  - Macro-Chaining `#9B4F86` / `#F3E6EF`
  - Rep Rotator `#C9772E` / `#F6EADB`
- **Mastery = how performance-ready** (a ramp), used only on progress bars + tempo badges:
  - `< 55%` → `--danger`, `55–79%` → `--warn`, `≥ 80%` → `--success`.
- **Pieces are neutral** — ink monogram on a `--surface-sunk` chip. No per-piece color.
- **Folders** may carry one user-chosen soft tint (low saturation), deliberately gentler than strategy hues.

**Don't** render strategies as a row of fully-saturated filled pills. Default state = neutral white card + small colored tag/dot; full color appears only when selected/active.

## 3. Typography

- **Display / all headings → Bricolage Grotesque**, weight 600–700, `letter-spacing:-0.02em`. Page titles ~28–32px, section headers ~16–17px.
- **UI / body → Hanken Grotesk.** Body 13.5–15px, captions 11–12px.
- Numerals that change (BPM, timers, counts, %) → `font-variant-numeric: tabular-nums`.
- **Most common bug:** section headers rendered in the body sans. Every `<h*>`/section label must be Bricolage.

## 4. Shape, elevation, spacing

- Radii: cards/sheets **16–18px**, buttons/chips **12–14px**, pills/toggles/dots **99px**. Phone frame 42px.
- Borders: 1px `--border` (or `--border-strong` on sunk surfaces). Hairline, not heavy.
- Shadows are soft and sparse: `0 10px 26px -16px rgba(20,30,30,.4)` for raised cards; reserve stronger shadows for floating/overlay elements. No hard or pure-black shadows.
- Screen padding ~22px horizontal. Gaps between stacked cards ~10–11px. Section spacing ~22–26px.

## 5. Buttons & hierarchy

- **Primary** = filled `--accent`, white text, weight 700.
- **Secondary** = white surface + `--border`, ink text.
- **Tertiary** = `--surface-sunk`, ink text.
- **Destructive primary** = filled `--danger` (only for the single most irreversible action on a screen).
- **Destructive secondary** = ghost: white bg, `--danger-ghost-border` border, `--danger` text.
- Only **one** filled-danger button per screen; everything lower-risk is ghost. Add a one-line permanence caveat under irreversible actions.
- Min hit target **44px**. Press feedback: `transform: scale(.985)`.

## 6. Icons

- Line icons only, **1.75px stroke**, round caps/joins, drawn in `--ink` (or the contextual color).
- **No emoji / 3D glyphs** as functional icons (drum, mic, clipboard, etc. → line equivalents).
- Group related utilities into one container (a white pill) rather than scattered separate boxes; set support/affective actions apart with a warm tint.

## 7. Cards, inputs, lists

- Card = `--surface`, 1px `--border`, 16–18px radius.
- Inputs/search = `--surface`, `--border`, leading line icon in `--ink-faint`, placeholder in `--ink-faint`.
- List rows: leading visual (neutral monogram / thumb), title (`--ink`, 700), meta (`--ink-faint`), trailing chevron `#C2C7C6`. Use flex/grid with `gap` — not margins on inline siblings.
- Badges/chips: soft-tint bg + same-hue text; uppercase micro-labels (Research, Beta) at ~9.5px, weight 800, `letter-spacing:.05em`.

## 8. Layout / responsive

- Phone is the base. On wider/landscape, the **score is the hero** — full-bleed; controls float over it; secondary panels (strategies) live behind a launcher rather than taking permanent space.
- Don't shrink the score to fit chrome. Reading the music wins.

---

## Sweep checklist (per screen)
1. Replace every hardcoded hex with a token; kill stray blues and extra reds.
2. Section headings → Bricolage; confirm body is Hanken; tabular-nums on changing numbers.
3. One filled-danger button max; demote the rest to ghost; add permanence note.
4. Emoji/3D icons → 1.75px line icons in `--ink`.
5. Normalize radii (16–18 cards / 12–14 controls / 99 pills) and the hairline border.
6. Verify color means one thing here (strategy **or** mastery **or** neutral — never two at once).
7. Convert inline/margin-spaced rows to flex/grid `gap`.
8. Hit targets ≥ 44px; add `scale(.985)` press state.

**Out of scope:** copy changes, feature/logic changes, data shape, navigation behavior. Styling and markup only.

---

## Find the violations (ripgrep)

Run these from the repo root to locate things to fix. Tune extensions (`-g '*.{ts,tsx,js,jsx,css,scss}'`) to your stack. The intent matters more than the exact regex — review each hit, don't blind-replace.

```bash
# 1. Stray reds that should collapse to --danger (#D9523E)
rg -i '#(c0392b|b5432f|b34|a8|cc3|d32f2f|e53|ff0000|red)\b'

# 2. Any raw hex at all — audit against the token list, replace with a var
rg -o '#[0-9a-fA-F]{6}\b' -g '!**/tokens.*' | sort | uniq -c | sort -rn

# 3. Off-brand blues/teals that aren't the petrol accent (#0A7598 / #075A77 / #E1EFF4)
rg -i '#(007|008|009|00a|17a2|0d6efd|2196f3|0a84ff|3b82f6|0ea5e9)[0-9a-f]*'

# 4. Emoji / 3D glyphs used as functional icons
rg -P '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE0F}]'

# 5. Headings NOT on Bricolage — eyeball each <h1-3>/section label
rg -n '<h[1-3]|role="heading"|SectionTitle|sectionHeader'
#    then check none fall back to the body sans

# 6. Hardcoded font families (should be Bricolage / Hanken via token or class)
rg -i "font-family\s*[:=]" -g '!**/fonts.*'

# 7. Radius values to normalize → 12–14 (controls) / 16–18 (cards) / 9999 (pills)
rg -o 'border-?[rR]adius[:= ]+[0-9]+' | sort | uniq -c | sort -rn

# 8. Multiple filled-danger buttons on one screen (manual review of matches)
rg -n 'danger|destructive|delete|reset|clear' -g '*.{tsx,jsx}' -l

# 9. Changing numbers missing tabular-nums (BPM, timers, %, counts)
rg -n 'BPM|bpm|tempo|elapsed|count|%|\bmin\b' -g '*.{tsx,jsx}' \
  | rg -v 'tabular-nums'   # candidates to add font-variant-numeric

# 10. Inline/margin-spaced rows that should be flex/grid + gap
rg -n 'margin-?[lr]|marginRight|marginLeft' -g '*.{tsx,jsx,css,scss}'

# 11. Hard/black shadows (should be soft, colored-neutral, sparse)
rg -i 'box-?shadow[^;]*(#000|black|rgba\(0,\s*0,\s*0,\s*(0?\.[5-9]|1))'

# 12. Tiny hit targets — buttons/taps under 44px
rg -n '(width|height)\s*[:=]\s*(2[0-9]|3[0-9]|4[0-3])px' -g '*.{tsx,jsx,css}'
```

**Workflow:** start with #1 and #3 (color drift — highest visual payoff and lowest risk), then #5/#6 (type), then #8 (danger hierarchy). Do each as its own small commit so changes stay reviewable.

