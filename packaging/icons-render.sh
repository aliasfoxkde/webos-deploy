#!/usr/bin/env bash
# Rasterize each app's icons/icon.svg and icons/icon-maskable.svg to PNG
# (512 + 192) using headless Chromium (ImageMagick's SVG renderer is too
# limited for stroked paths). PNGs land next to the SVGs.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPS="$HERE/../apps"
CHROME="${CHROME:-/usr/bin/chromium}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

render() { # svgpath outpng size
  local svg=$1 out=$2 size=$3
  cat > "$OUT/page.html" <<HTML
<!DOCTYPE html><html><head><style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden}
  svg{display:block;width:${size}px;height:${size}px}
</style></head><body>$svg</body></html>
HTML
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --default-background-color=00000000 --window-size=$size,$size \
    --screenshot="$out" "file://$OUT/page.html" >/dev/null 2>&1
}

for dir in "$APPS"/*/; do
  app=$(basename "$dir")
  icon="$dir/icons"
  [ -f "$icon/icon.svg" ] || continue
  render "$(cat "$icon/icon.svg")"          "$icon/icon-512.png" 512
  render "$(cat "$icon/icon-maskable.svg")" "$icon/icon-maskable-512.png" 512
  magick "$icon/icon-512.png"          -resize 192x192 "$icon/icon-192.png"
  magick "$icon/icon-maskable-512.png" -resize 192x192 "$icon/icon-maskable-192.png"
  echo "$app: icons rendered"
done
