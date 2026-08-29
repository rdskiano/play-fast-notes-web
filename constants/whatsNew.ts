// "What's new" notes shown behind the bell in the library header.
//
// Add a new entry at the TOP whenever a push/OTA ships something user-visible
// — especially fixes for things that were silently broken, so users who hit
// the bug learn it's fixed instead of quietly losing trust in the app. Write
// in plain English for musicians: what they saw, what changed. Two or three
// sentences max.
//
// The `id` must be unique and stable (date + slug). The quiet dot on the bell
// appears whenever the newest entry's id differs from the user's last-seen id
// (stored in settings, so it follows the account across devices on web).

export type WhatsNewEntry = {
  id: string;
  /** Human-readable date shown above the note, e.g. 'July 21, 2026'. */
  date: string;
  title: string;
  body: string;
};

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: '2026-08-25-two-metronomes-fix',
    date: 'August 25, 2026',
    title: 'Fixed: two metronomes clicking at once',
    body:
      'If you left the metronome running while reading a PDF and then started practicing a passage on that page, you ended up with two clicks going at two different speeds. The app keeps the previous screen alive behind you, and its metronome kept clicking underneath the new one. Now only the screen you are actually looking at can click. When you go back, the metronome is stopped and waiting for you to press play.',
  },
  {
    id: '2026-08-25-custom-ladder-follows-dial',
    date: 'August 25, 2026',
    title: 'Tempo Ladder: a Custom pattern now follows the tempo you actually played',
    body:
      'In a Custom pattern, turning the tempo down mid session was ignored. If the pattern wanted 92 and you dialed back to 84 and played it clean, the celebration still offered to bump you to 93, and next time you picked up at the old tempo. Now the base moves with you, so a clean run at 84 offers 85 and next session starts where you really are. Step mode already worked this way.',
  },
  {
    id: '2026-08-25-icu-metronome-tool',
    date: 'August 25, 2026',
    title: 'New tool: the ICU Metronome, for practicing from the book',
    body:
      'Doing Interleaved Click-Up from Molly Gebrian\'s book, with paper diagrams on the stand? The Tools room now has a metronome built for exactly that. Enter your performance tempo and increment, flip the device over, and just press NEXT after each step: it climbs for you, drops back to your starting tempo when a phase completes, and celebrates when you reach performance tempo. The spacebar and foot pedals work as NEXT too.',
  },
  {
    id: '2026-08-25-coach-sees-icu2',
    date: 'August 25, 2026',
    title: 'The practice coach now sees your Interleaved Click-Up 2 sessions',
    body:
      'If your last work on a passage was an Interleaved Click-Up 2 rotation, the coach used to overlook it and suggest something older. It now counts those sessions like any other and can point you right back into ICU 2, seeded with that passage.',
  },
  {
    id: '2026-08-25-import-retired',
    date: 'August 25, 2026',
    title: 'iPad: the old "Download my web library" screen is retired',
    body:
      'Your music now syncs between web and iPad automatically, so the old manual download screen (and its risky "replace everything on this iPad" option) is gone. If your device ever looks out of date, the Sync section in Account has a new "Re-download everything" button. It only adds and updates. It never deletes anything.',
  },
  {
    id: '2026-08-25-pencil-ink-color',
    date: 'August 25, 2026',
    title: 'Your pencil remembers its ink color',
    body:
      'If you mark your parts in a color, the pencil used to forget it every time you closed it. Now, while the pencil is open, a small row of ink dots sits under the header. Pick one and every future pencil session starts in that color. Many players use a bright ink so markings are easy to spot and easy to copy onto a paper part later.',
  },
  {
    id: '2026-08-25-builder-view-score',
    date: 'August 25, 2026',
    title: 'Exercise Builder: peek at your part while setting up',
    body:
      'A cropped passage can hide things like the key signature at the start of the line. The Exercise Builder now has the same View score button as the practice setup screens, in the top bar during setup and note entry. One tap shows your full part with the passage outlined, and one tap brings you back.',
  },
  {
    id: '2026-08-25-library-log-sections',
    date: 'August 25, 2026',
    title: 'The library practice log now groups by section, like the document log',
    body:
      'In the full-library practice log, passages from a PDF used to show the movement name squeezed into each card title, which read as one long confusing name. Now the library log uses the same layout as the log inside a document: the piece, then each movement as its own header, with the passage cards underneath.',
  },
  {
    id: '2026-08-24-type-your-own-numbers',
    date: 'August 24, 2026',
    title: 'Type your own numbers on the setup screens',
    body:
      'The preset buttons for tempo increment and clean-reps targets were the only choices you had. Now Tempo Ladder (Climb by and Clean reps), Interleaved Click-Up (Increment), and Rep Rotator (clean reps) each have an extra box next to the presets where you can type any number you like, from 1 to 99. Want to climb by 4s, or make the 10th rep the pressure rep by requiring 9 clean? Now you can.',
  },
  {
    id: '2026-08-24-rep-rotator-exit',
    date: 'August 24, 2026',
    title: 'Rep Rotator: leave without logging, and cleaner session records',
    body:
      'Ending a Rep Rotator session used to record a practice entry for every passage in the rotation no matter what, even if you never played a rep. Now a session where nothing was marked simply closes without writing anything, the end-of-session sheet has an "Exit without logging" option, and a partial session records only the passages you actually worked.',
  },
  {
    id: '2026-08-23-evaluate-view-part',
    date: 'August 23, 2026',
    title: 'First-practice evaluation: check your part before you set a goal',
    body:
      'The "Ready to practice?" evaluation flow now has a View full part button on the music window, the same peek the other setup screens have. It opens your whole part with the passage outlined, so you can flip to the printed tempo marking before locking in a goal, and one tap brings you straight back.',
  },
  {
    id: '2026-08-23-icu-full-run',
    date: 'August 23, 2026',
    title: 'Interleaved Click-Up: a full run at your goal tempo caps every phase',
    body:
      'Reaching your goal tempo used to jump straight to the next unit, wherever you were in the pattern. Now each phase ends with a payoff: play everything you have built so far, from the first unit through the newest one, in one run at your goal tempo. The tracker pill says FULL RUN when it is that moment, and the final phase ends with the whole passage at performance tempo.',
  },
  {
    id: '2026-08-23-icu-forward-default',
    date: 'August 23, 2026',
    title: 'Fixed: Interleaved Click-Up no longer stays stuck in reverse',
    body:
      'If you accepted the "try it in reverse" offer at the end of a climb, the next session on that passage quietly started backward too. Every session now starts forward, and reverse only happens when you choose it. The mark-your-units screen also got much roomier: your music now fills the screen instead of a narrow strip.',
  },
  {
    id: '2026-08-23-mic-blocked-help',
    date: 'August 23, 2026',
    title: 'The recorder now tells you how to un-block your microphone',
    body:
      'If your browser was blocking the microphone, the recorder showed an unhelpful "Permission denied." It now explains exactly what to do: click the padlock next to the web address, set Microphone to Allow, and reload. It also says so plainly when no microphone is plugged in or another app is using it.',
  },
  {
    id: '2026-08-22-pill-edge-fix',
    date: 'August 22, 2026',
    title: 'Fixed: passage pills near the screen edge were hard to tap on phones',
    body:
      'On a phone, tapping a passage pill sitting against the left edge of the screen could kick you back to the previous page instead. That strip of the screen belongs to your phone\'s "swipe back" gesture, and it was stealing the tap. Pills and the Practice bar now keep a safe distance from the edge, so the tap goes where you meant it.',
  },
  {
    id: '2026-08-22-picker-order',
    date: 'August 22, 2026',
    title: 'Picking passages is faster, and a missed climb defaults to a redo',
    body:
      'The passage picker in Interleaved Click-Up 2 and Rep Rotator now lists your newest pieces first instead of alphabetically, and the piece you opened the picker from starts at the top. In an ICU 2 session, the highlighted choice after a miss is now "Start this climb over" rather than saving the tempo and moving on. And the confusing "Not yet" button on Interleaved Click-Up\'s finish screen is gone: just pick a direction or finish and log.',
  },
  {
    id: '2026-08-21-tempo-prefill',
    date: 'August 21, 2026',
    title: 'Fixed: your goal tempos now follow you into every tool',
    body:
      'Setting a goal tempo on one passage was supposed to pre-fill the tools on its neighbors in the same section, but several tools ignored it, including both Chaining modes and Interleaved Click-Up 2. Now every setup screen pre-fills from the same place: the passage\'s own saved tempo first, then the most recent tempo you decided in that section. And if a saved session is showing an older goal, a small "Tap to use it" chip offers the newer one instead of silently keeping the stale number.',
  },
  {
    id: '2026-08-21-setup-view-score',
    date: 'August 21, 2026',
    title: 'Check your music while setting tempos',
    body:
      'Setup screens now have a "View score" button next to the tempo controls, in Tempo Ladder, Click-Up, both Chaining modes, and Interleaved Click-Up 2. It opens the full page of your part with your passage outlined, and you can flip through pages and pinch to zoom, so you can find the printed tempo marking before you commit to a goal. One tap brings you straight back to setup with nothing changed.',
  },
  {
    id: '2026-08-21-icu-backward',
    date: 'August 21, 2026',
    title: 'Interleaved Click-Up can now build backward (beta)',
    body:
      'Molly Gebrian teaches that clicking up works equally well built from the last unit toward the first, and she starts backward when the end of a passage is the hard part, since the units you begin with are the ones you revisit most. You can now choose "From the end" on the tempo screen, using the same unit marks. And when you finish a full climb, the app offers a choice: run the same climb again in the other direction, or finish and log the session.',
  },
  {
    id: '2026-08-21-stale-crop-fix',
    date: 'August 21, 2026',
    title: 'Fixed: a resized passage could keep showing its old crop on iPad',
    body:
      'After you resized a passage box on the iPad, some screens could keep drawing the old crop from the image cache, which also threw off where Click-Up spot markers landed. Passage images are now saved in a way the cache cannot get wrong. If a passage of yours still looks stale, open its box and resize it once more; from then on it stays correct.',
  },
  {
    id: '2026-08-21-icu2-beta',
    date: 'August 21, 2026',
    title: 'New strategy in beta: Interleaved Click-Up 2',
    body:
      'Interleaved Click-Up teaches you a passage. This one trains something different: playing it clean at tempo on the first try. Pick 3 to 5 fast passages (7 to 10 if they are short), and the app rotates you through them in seven rounds of climbing tempos, with bigger jumps each round. If you miss, you choose: restart the climb, start slower, or save that tempo as today\'s ceiling and watch it rise across sessions. Find it on the passage page next to Rep Rotator. Micro- and Macro-Chaining now live together behind one Chaining button to make room.',
  },
  {
    id: '2026-08-20-ipad-purchase',
    date: 'August 20, 2026',
    title: 'You can now unlock Practice Pro right on your iPad',
    body:
      'The one-time Practice Pro unlock is now available as a regular App Store purchase, right inside the iPad app. One payment, yours forever, and it unlocks your account everywhere, web included. If you already bought it on the website, nothing changes: your iPad stays unlocked. Bought it on the iPad but signed in somewhere new? Tap "Restore purchase" on the unlock screen.',
  },
  {
    id: '2026-08-19-video-help-passage-page',
    date: 'August 19, 2026',
    title: 'Video walkthroughs on the passage page',
    body:
      'The ? button on the passage page now opens a menu of seven short videos: the practice strategies, the How should I practice button, the metronome, the practice timers, the pencil tool, the recording tool, and the practice log. Tap a title to watch just the part you need.',
  },
  {
    id: '2026-08-18-measurement-screen-redesign',
    date: 'August 18, 2026',
    title: 'The first-practice measurement screen got a real metronome',
    body:
      'When you practice a passage for the first time, the app measures where you are: goal tempo, one try at full speed, then your comfortable starting tempo. That screen now shows your music at the same size as the passage page, with a metronome right on it, so you can hear any tempo before you commit to it. When a number sounds right, one button locks it in. On a phone it works sideways, like every practice screen: the music fills the screen and the metronome sits in one strip along the bottom.',
  },
  {
    id: '2026-08-18-remark-restarts-clickup',
    date: 'August 18, 2026',
    title: 'Re-marking a passage now restarts Interleaved Click-Up cleanly',
    body:
      'If you went back mid-session to change your unit marks, the session could resume against the old marks: wrong step counts, and units lighting up in a baffling order. Changing your marks now starts the session fresh from Step 1, as it should. Going back just to look, without changing anything, still resumes where you left off.',
  },
  {
    id: '2026-08-18-video-help-library',
    date: 'August 18, 2026',
    title: 'Video walkthroughs in the library help',
    body:
      'Tap the round "i" button on the library screen and you now get short video walkthroughs instead of just text: adding music by photo, camera roll, or PDF, folders, deleting, and the community library. Each one is under two minutes, and you pick exactly the question you have instead of scrubbing through one long tutorial. More screens get their videos soon.',
  },
  {
    id: '2026-08-16-smoother-scanning',
    date: 'August 16, 2026',
    title: 'Scanning pages is smoother',
    body:
      'When you scan a part with the camera, fix each page right in the scanner as you take it: drag the corners or retake the shot before moving on. The extra page-by-page review screen after scanning is gone. You now name your piece right after scanning, and a scanned part shows up in your library as a full part with its page count, not as a photo.',
  },
  {
    id: '2026-08-16-tidy-corner',
    date: 'August 16, 2026',
    title: 'The tool icons stopped stepping on each other',
    body:
      'On laptop screens, the practice log button could land on top of the row of tool icons in the upper-right corner of a passage. The corner is now one tidy row: your tools in the white pill, and the log button as a matching round chip beside it. Your logged sessions also now go by one name everywhere, Practice Log, with the same little open-book icon wherever it appears, and the in-app help describes the tools as they look today instead of the older edge-of-screen design.',
  },
  {
    id: '2026-08-16-simpler-start',
    date: 'August 16, 2026',
    title: 'A simpler start',
    body:
      'Creating an account is now one quick setup: your name, your instrument, your email, and a password. The guided demo tour is retired, and new users land in their own empty library, ready to add their first passage. On the iPad the app now asks you to sign in before you start, so everything you do is backed up to your account from day one.',
  },
  {
    id: '2026-08-15-music-follows-you',
    date: 'August 15, 2026',
    title: 'Music you add on the web now appears on your iPad by itself',
    body:
      'Add a piece on playfastnotes.com at home, and it shows up in your iPad library on its own, usually within a minute. The first time you open it on the iPad, its pages download and stay on the device, so it keeps working in a practice room with no wifi. Pencil marks now travel too: draw on the iPad and the marks show up on the web, edit on the web and the iPad picks it up.',
  },
  {
    id: '2026-08-15-ipad-two-way-sync',
    date: 'August 15, 2026',
    title: 'Your iPad now backs itself up',
    body:
      'Until now, work you did on the iPad app (marking passages, renaming, practice history, progress) stayed only on the iPad, and only new pieces reached your web account. Now the iPad quietly syncs both ways in the background: everything you do on the device is backed up to your account, and renames, moves, and deletions made on the web come back to the iPad. Sign in once on the iPad (Account screen) and it takes care of itself; a new Sync section in Account shows you its status.',
  },
  {
    id: '2026-08-15-pencil-marks-stick',
    date: 'August 15, 2026',
    title: 'Pencil marks on iPad-created passages no longer vanish',
    body:
      'If you created a passage on the iPad (a photo, or an excerpt spanning two pages) and drew on it with the Apple Pencil, your marks could silently disappear the next time the passage loaded. They now save on the iPad itself first, so they survive reloads, offline sessions, and app updates. Marks on pages of PDFs and photo documents were never affected.',
  },
  {
    id: '2026-08-14-ladder-honesty',
    date: 'August 14, 2026',
    title: 'The Tempo Ladder remembers honestly, and helps when you are stuck',
    body:
      'If you turned the metronome down mid-session, your next session used to reopen at the old, higher start tempo and quietly overwrite your real progress. Now the ladder reopens right where you actually left off, and just opening a session without playing a rep no longer moves your progress number. One more thing: if you miss three times at a tempo before landing a clean run, the coach now offers to drop the tempo for you, one tap. "No thanks" keeps it quiet for the rest of the session.',
  },
  {
    id: '2026-08-14-evaluation-shows-the-music',
    date: 'August 14, 2026',
    title: 'The first-practice measurement now shows your music',
    body:
      'The measurement flow was asking "can you play it?" on a screen that hid the passage. The passage now sits right under every step, pinch to zoom, so you can see exactly what you are being asked to play.',
  },
  {
    id: '2026-08-14-skip-a-note',
    date: 'August 14, 2026',
    title: 'Entering rests in the Exercise Builder: one simple key',
    body:
      'The rest palette from yesterday (16th, 8th, quarter, dot, triplet mode) turned out to require translation math that was easy to get silently wrong. It is now a single "Skip a note" key: one tap for each missing note, counted the way you read your own passage. Also fixed: backing out of a brand-new exercise before entering any notes no longer leaves an empty exercise in your list.',
  },
  {
    id: '2026-08-14-score-page-pills-polish',
    date: 'August 14, 2026',
    title: 'Passage pills: easier to spot, quicker to get out of the way',
    body:
      'The name pills on your score pages are now solid blue with white text, so they stand out instead of fading into the page. And when you tap one to open a spot, every pill disappears so nothing sits on top of your music — just the highlighted box, with its Practice, Edit, and History buttons floating right above it. Tap anywhere else on the page and the pills come back.',
  },
  {
    id: '2026-08-13-exercise-builder-rests',
    date: 'August 13, 2026',
    title: 'The Exercise Builder can finally hold its breath',
    body:
      'Passages that start with — or contain — a rest couldn\'t be entered into the Exercise Builder before. There\'s now a rest palette above the piano: tap a 16th, 8th, or quarter rest and the app fits it into your running sixteenths automatically. A · button dots the next rest, and ³ is for passages that run in triplets. Generated exercises re-time the rest along with the notes — the notes after it land in new, sometimes surprising places, which is exactly the kind of displacement practice you can\'t give yourself. Playback and the printable PDF include the rests too.',
  },
  {
    id: '2026-08-13-coach-proposes-the-note',
    date: 'August 13, 2026',
    title: 'The end-of-session note now comes with a suggestion',
    body:
      'The coach watched your session, so when you finish, its pick among the choices is marked with a * and a short line explaining why. Tap any choice and the app will remind you of it once, next session — and there\'s always a notes box for your own words.',
  },
  {
    id: '2026-08-13-first-practice-evaluation',
    date: 'August 13, 2026',
    title: 'New passages start with a one-minute measurement',
    body:
      'The first time you practice a passage, the app now takes its measurements: the goal tempo (offered automatically once you\'ve set one for any other passage in the same section — always changeable), one try straight at that goal — if it\'s clean, the passage is marked performance-ready and you\'re done — and if not, you find your comfortable clean tempo. Then the Tempo Ladder is set up for you: starting a notch below your clean tempo, aiming at the goal. You type nothing.',
  },
  {
    id: '2026-08-13-coach-reads-your-trail',
    date: 'August 13, 2026',
    title: 'The coach now reads your practice history',
    body:
      '"How should I practice?" no longer asks you a list of questions. It looks at what you\'ve actually done with the passage and makes one suggestion with the reason spelled out — for example, after a few steady Tempo Ladder sessions it suggests Interleaved Click-Up to cement what you\'ve built. The full strategy list is right below it, so the coach only ever suggests; you decide.',
  },
  {
    id: '2026-08-13-land-on-the-page',
    date: 'August 13, 2026',
    title: 'After a session, you land back on the page',
    body:
      'When you finish and log a practice session on a passage that lives in a PDF or photo, the app now returns you to that page of the score — right where the passage is — instead of the passage screen. You finish a spot, you\'re looking at the music, ready to pick the next one. Passages that aren\'t part of a bigger page work the way they always did.',
  },
  {
    id: '2026-08-13-pills-first-pages',
    date: 'August 13, 2026',
    title: 'A cleaner score: passage boxes became name pills',
    body:
      'On PDF and photo pages, your marked passages no longer sit under gray rectangles. Each one is now a small name pill at the spot where it starts — the score itself stays clean. Tap a pill and that one passage lights up, with Practice, Edit, and History right there; tap anywhere on the score to tuck it away. Passages inside other passages finally work: only one box ever draws at a time, and pills that would land on top of each other stack neatly. The old "Hide boxes" button is now "View a blank page" for a completely clean read.',
  },
  {
    id: '2026-08-13-smarter-session-notes',
    date: 'August 13, 2026',
    title: 'End-of-session notes that come back ready to act',
    body:
      'The one-tap suggestions at the end of a session now match the tool you just used — after Tempo Ladder you\'ll see "Keep climbing the tempo," after Interleaved Click-Up you\'ll see "Use larger units next time," and so on. Tapping a suggestion automatically checks "Remind me of this next time" (uncheck it and your choice wins). When a reminder greets you on the passage screen, it now carries buttons that take you straight into the right tool — "Start slower next time" even opens Tempo Ladder with your start tempo already dropped about 10%, and an Exercise Builder reminder reopens the exact exercise you built, ready to play. Each reminder shows once: after your next session on that passage it stops nagging, though the note stays in your practice log.',
  },
  {
    id: '2026-08-13-rotation-fix-for-real',
    date: 'August 13, 2026',
    title: 'The rotation fix, take two — actually fixed this time',
    body:
      'Yesterday\'s note said rotating your phone no longer scrambled the strategy cards — that fix didn\'t hold, and if you rotated you still got stretched, stacked cards. The real cause is now found and the fix verified on a simulator before shipping: rotate as much as you like, the cards stay in their two columns.',
  },
  {
    id: '2026-08-12-rotation-grid-and-blurb-clipping',
    date: 'August 12, 2026',
    title: 'Fixed: strategy cards scrambled after rotating your phone',
    body:
      'On iPhone, turning the phone sideways and back left the practice-strategy cards stretched and stacked wrong until you left the screen. They now snap back to their proper two-column layout the moment you rotate. Also fixed: the cards\' descriptions were getting cut off mid-sentence — they now always show in full.',
  },
  {
    id: '2026-08-12-wipe-guard-card-blurbs',
    date: 'August 12, 2026',
    title: 'A safety net for "Download my web library," and clearer strategy cards',
    body:
      'On the iPad app, "Download my web library" with the replace option could permanently delete passages and practice history that existed only on that iPad — with no warning about what would be lost. Now the app counts exactly what lives only on your device, tells you in plain English, and requires typing DELETE before anything is erased. Cancelling leaves everything untouched. Also: the six strategy cards now say when you\'d reach for each tool — like Rhythmic Variation for running sixteenths, or Rep Rotator for mock-audition practice near a performance — instead of just describing what they do.',
  },
  {
    id: '2026-07-28-crash-pencil-click-truth',
    date: 'July 28, 2026',
    title: 'Fixed: crash on "Save & finish," pencil marks vanishing, and the metronome dial now moves your ladder',
    body:
      'Three fixes from real practice sessions. Saving your end-of-session note could crash the iPad app — fixed, and your notes were never lost. Pencil annotations could show false "could not save" errors and then genuinely lose your marks on closing — fixed. And in Tempo Ladder, changing the metronome tempo mid-session now moves the ladder with it: your clean reps count at the tempo actually clicking, and your progress and resume point stay honest. Also: tapping Clean or Miss with a tool panel open now registers the rep instead of just closing the panel, and the Click-Up marking screen now reminds you to place one final mark after the last note.',
  },
  {
    id: '2026-07-27-practice-flow-batch',
    date: 'July 27, 2026',
    title: 'Smoother practice sessions: tempo settings carry over, and 6 small fixes',
    body:
      'When you mark several passages in the same piece, a new Tempo Ladder now starts with the same tempos and settings you used on the last one — no more re-typing your start and goal BPM for every passage. Also fixed: tapping outside an open tool (like the metronome) now closes it; the step-up message briefly flashed the wrong tempo; "End session" no longer sits right next to "Step up tempo" looking identical, so it\'s harder to end a session by accident; passage names on crowded pages no longer overlap the progress badge of the box above; and the end-of-session note now offers one-tap suggestions like "Introduce some variation."',
  },
  {
    id: '2026-07-27-ipad-pencil-palette',
    date: 'July 27, 2026',
    title: 'Fixed: Apple Pencil palette vanished on practice screens (iPad app)',
    body:
      'On the iPad app, opening the Pencil tool during practice made the drawing palette slide up and immediately disappear — the foot-pedal listener was stealing its focus. The palette now stays put (the foot pedal simply pauses while you draw). Also fixed: closing the Pencil tool without drawing anything showed a false "could not save" error.',
  },
  {
    id: '2026-07-21-metronome-first-start',
    date: 'July 21, 2026',
    title: 'Fixed: metronome could be silent on its first start',
    body:
      'On iPads especially, the very first metronome start after opening the app could play nothing — the button showed it running, but no click. Stopping and starting again worked around it. That is now fixed, and if sound ever fails to start, tapping anywhere on the page wakes it up.',
  },
  {
    id: '2026-07-20-offline-notation',
    date: 'July 20, 2026',
    title: 'Notation now works without internet',
    body:
      'The music notation in rhythm exercises, demos, and the Exercise Builder used to need an internet connection to draw. It is now built into the app itself, so your staves appear even on flaky or heavily filtered wifi — school networks included.',
  },
];

export const LATEST_WHATS_NEW_ID = WHATS_NEW[0]?.id ?? '';

/** Settings key holding the id of the newest entry the user has opened. */
export const WHATS_NEW_SEEN_KEY = 'whatsNew:lastSeenId';
