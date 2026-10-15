#!/usr/bin/env bash
# Renders every deliverable into promo/final/ (H.264, 60 fps, yuv420p, AAC 320 kb/s).
# In sandboxes without access to remotion.media, point REMOTION_BROWSER_EXECUTABLE at a
# local Chrome Headless Shell (see promo/README.md).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p final

common=(--codec=h264 --crf=16 --x264-preset=slow --pixel-format=yuv420p --color-space=bt709 --jpeg-quality=95 --audio-bitrate=320k)

npx remotion render src/index.ts Promo-1x1 final/warrenia-x-1080x1080.mp4 "${common[@]}"
npx remotion render src/index.ts Promo-16x9 final/warrenia-x-1920x1080.mp4 "${common[@]}"
for v in A B C; do
  npx remotion render src/index.ts "Hook-$v" "final/hooks/hook-$v-1080x1080.mp4" "${common[@]}"
done
# Cover: the claim with the app and its figures settled.
npx remotion still src/index.ts Promo-1x1 final/cover-1080x1080.png --frame=505
npx remotion still src/index.ts Promo-16x9 final/cover-1920x1080.png --frame=505
