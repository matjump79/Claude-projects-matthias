#!/usr/bin/env bash
# Frames -> H.264. Rendered at 1920x1080 and resampled to 1280x720, which
# supersamples away the aliasing the software rasteriser cannot avoid.
set -euo pipefail
cd "$(dirname "$0")/.."
FPS=${FPS:-24}
IN=${IN:-frames}
OUT=${OUT:-out/ulm-1500.mp4}
SCALE=${SCALE:-1280:720}
AUDIO=${AUDIO:-music/ulm-1500.wav}
mkdir -p "$(dirname "$OUT")"

VF="scale=${SCALE}:flags=lanczos,format=yuv420p"

if [ -f "$AUDIO" ]; then
  ffmpeg -y -hide_banner -loglevel warning \
    -framerate "$FPS" -i "$IN/f%05d.jpg" -i "$AUDIO" \
    -vf "$VF" -c:v libx264 -preset slow -crf 19 -profile:v high -level 4.0 \
    -x264-params "keyint=48:min-keyint=24" \
    -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
else
  ffmpeg -y -hide_banner -loglevel warning \
    -framerate "$FPS" -i "$IN/f%05d.jpg" \
    -vf "$VF" -c:v libx264 -preset slow -crf 19 -profile:v high -level 4.0 \
    -x264-params "keyint=48:min-keyint=24" -an -movflags +faststart "$OUT"
fi
ls -lh "$OUT"
