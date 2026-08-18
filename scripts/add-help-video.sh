#!/bin/bash
# add-help-video.sh — compress a raw screen recording and install it as a
# help-popup tutorial video.
#
#   ./scripts/add-help-video.sh <recording.mov> <output-name>
#   e.g. ./scripts/add-help-video.sh ~/Downloads/RPReplay_Final.mov tempo-ladder-setup
#
# Uses ffmpeg (brew-installed 2026-08-18; macOS's avconvert can't reduce
# bitrate, it only repackages). Screen recordings are mostly static UI so
# CRF 27 crushes them ~10-20x while keeping text sharp. Height caps at
# 1080; +faststart puts the index up front so streaming playback starts
# before the file finishes downloading.
#
# Uses macOS's built-in `avconvert` (no ffmpeg install needed) to re-encode
# to 720p H.264, which turns a ~100MB iPad screen recording into a few MB.
# Output lands at public/videos/help/<help-id>.mp4 so it deploys with the
# web build. Remember to also add the entry in constants/helpVideos.ts —
# the file alone doesn't show up anywhere until it's registered there.
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <recording file> <output-name>" >&2
  exit 1
fi

in="$1"
id="$2"
repo="$(cd "$(dirname "$0")/.." && pwd)"
outdir="$repo/public/videos/help"
out="$outdir/$id.mp4"

if [ ! -f "$in" ]; then
  echo "Recording not found: $in" >&2
  exit 1
fi

mkdir -p "$outdir"
# -r 30 matters: iPad ProMotion screen recordings are 120fps, which iOS
# WebKit refuses to play back (verified 2026-08-18 — player loaded the
# poster frame but play did nothing, in the app AND in Safari).
ffmpeg -y -i "$in" \
  -vf "scale=-2:'min(1080,ih)'" -r 30 \
  -c:v libx264 -crf 27 -preset medium -pix_fmt yuv420p \
  -c:a aac -ac 1 -b:a 96k \
  -movflags +faststart \
  -loglevel error -stats \
  "$out"

echo ""
echo "Installed: $out"
ls -lh "$out" | awk '{print "Size: " $5}'
echo "Next: register '$id' in constants/helpVideos.ts"
