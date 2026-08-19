// helpVideos — the lookup table that puts tutorial videos at the top of a
// screen's "?" help popup. Each screen gets a LIST of short, titled clips:
// one clip renders as a player right away; several render as a tap-to-play
// menu so the user jumps straight to their question instead of scrubbing
// one long video (Ralph's call, 2026-08-18 — he hates scrub-to-find).
// Screens with no entry keep their text-only help, so rollout stays
// incremental: record a clip, run the script, add a line here.
//
// The video files live in public/videos/help/ and deploy with the web build,
// so they're served from https://playfastnotes.com/videos/help/<file>. Web
// loads them same-origin (works on localhost dev too); native streams the
// production URL, so a new video is visible on iPad only after the web push
// that carries the file. Videos STREAM — they don't work offline. The text
// body stays below the videos as the offline/stale-video fallback, so don't
// delete a screen's help text when its videos land.
//
// To add a clip: scripts/add-help-video.sh <recording.mov> <output-name>
// compresses it into place, then add the entry below. Duration for the
// `seconds` label: mdls -raw -name kMDItemDurationSeconds <file>.
//
// Every help id in the app (from each screen's <TutorialStep id=...>):
//   account, chunking-play, click-up-config, click-up-marking, click-up-play,
//   document-log, first-strategy, folder-log, images-viewer-overview,
//   library-add, library-log, macro-chaining-marking, macro-chaining-play,
//   micro-chaining-marking, micro-chaining-play, passage-crop,
//   passage-history, pdf-viewer-overview, rep-rotator-first-run,
//   rep-rotator-setup, rhythm-builder-entry, rhythm-builder-generate,
//   rhythm-builder-setup, rhythm-list, rhythmic-config, rhythmic-play,
//   self-led-play, self-led-recording, serial-practice-play,
//   tempo-ladder-play, tempo-ladder-setup, tools-hub, tools-metronome,
//   tools-rhythmic, tools-tempo-ladder, upload-document, upload-multipage,
//   upload-passage

export type HelpVideo = {
  // Filename under public/videos/help/ (e.g. 'library-adding-folder.mp4').
  file: string;
  // Shown on the tap-to-play row when a screen has several clips. Written
  // as the question the user is trying to answer.
  title: string;
  // Clip length, shown as m:ss on the row so the user knows the cost.
  seconds?: number;
  // width / height of the recording. Ralph's iPad portrait recordings are
  // 3:4 (0.75). The modal sizes the player box from this before the video
  // loads, so a wrong value shows letterboxing but never breaks layout.
  aspectRatio?: number;
};

export const DEFAULT_HELP_VIDEO_ASPECT = 16 / 9;

// Ralph's iPad screen recordings (1440x1920 → compressed 810x1080).
const IPAD_PORTRAIT = 3 / 4;

// The four practice-tool clips (recorded 2026-08-19 on the passage screen).
// The tool bar shows on every practice screen, so these can be appended to
// any screen's list — same files, no re-encode.
export const TOOLBAR_CLIPS: HelpVideo[] = [
  {
    file: 'toolbar-metronome.mp4',
    title: 'The metronome',
    seconds: 66,
    aspectRatio: IPAD_PORTRAIT,
  },
  {
    file: 'toolbar-practice-timers.mp4',
    title: 'The practice timers',
    seconds: 112,
    aspectRatio: IPAD_PORTRAIT,
  },
  {
    file: 'toolbar-pencil-tool.mp4',
    title: 'The pencil tool',
    seconds: 21,
    aspectRatio: IPAD_PORTRAIT,
  },
  {
    file: 'toolbar-recording-tool.mp4',
    title: 'The recording tool',
    seconds: 35,
    aspectRatio: IPAD_PORTRAIT,
  },
];

export const HELP_VIDEOS: Record<string, HelpVideo[]> = {
  // Library screen — recorded 2026-08-18.
  'library-add': [
    {
      file: 'library-tools-in-upper-right.mp4',
      title: 'The buttons in the top corner',
      seconds: 105,
      aspectRatio: IPAD_PORTRAIT,
    },
    {
      file: 'library-add-piece-take-photo.mp4',
      title: 'Add music by taking a photo',
      seconds: 79,
      aspectRatio: IPAD_PORTRAIT,
    },
    {
      file: 'library-adding-piece-from-camera-role.mp4',
      title: 'Add music from your camera roll',
      seconds: 41,
      aspectRatio: IPAD_PORTRAIT,
    },
    {
      file: 'library-adding-piece-from-file.mp4',
      title: 'Add music from a PDF file',
      seconds: 38,
      aspectRatio: IPAD_PORTRAIT,
    },
    {
      file: 'library-adding-folder.mp4',
      title: 'Add a folder',
      seconds: 39,
      aspectRatio: IPAD_PORTRAIT,
    },
    {
      file: 'library-add-piece-to-folder.mp4',
      title: 'Put a piece in a folder',
      seconds: 27,
      aspectRatio: IPAD_PORTRAIT,
    },
    {
      file: 'library-delete-piece.mp4',
      title: 'Delete a piece',
      seconds: 16,
      aspectRatio: IPAD_PORTRAIT,
    },
    {
      file: 'library-community-library.mp4',
      title: 'The community library',
      seconds: 66,
      aspectRatio: IPAD_PORTRAIT,
    },
  ],

  // Passage viewing screen — recorded 2026-08-19.
  'first-strategy': [
    {
      file: 'passage-practice-strategies.mp4',
      title: 'The practice strategies',
      seconds: 67,
      aspectRatio: IPAD_PORTRAIT,
    },
    {
      file: 'passage-how-should-i-practice.mp4',
      title: 'The "How should I practice?" button',
      seconds: 50,
      aspectRatio: IPAD_PORTRAIT,
    },
    ...TOOLBAR_CLIPS,
    {
      file: 'passage-practice-log.mp4',
      title: 'The practice log',
      seconds: 35,
      aspectRatio: IPAD_PORTRAIT,
    },
  ],
};

export function helpVideosFor(id: string): HelpVideo[] {
  return HELP_VIDEOS[id] ?? [];
}

export function formatClipLength(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Web plays same-origin so localhost dev serves the local file and prod
// serves the deployed one.
export function helpVideoWebPath(video: HelpVideo): string {
  return `/videos/help/${video.file}`;
}

// Native (iPad) streams from the live site — the app bundle never carries
// video weight, and new videos reach existing installs without an OTA.
export function helpVideoAbsoluteUrl(video: HelpVideo): string {
  return `https://playfastnotes.com/videos/help/${video.file}`;
}
