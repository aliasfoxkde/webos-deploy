#!/usr/bin/env bash
# Rasterize the WebOS logo into PWA PNGs (512/192, plain + maskable) using
# headless Chromium — same technique as icons-render.sh.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ICONS="$HERE/../webos/public/icons"
CHROME="${CHROME:-/usr/bin/chromium}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

render() { # svgfile outpng size bgcolor
  local svg=$1 out=$2 size=$3 pad=$4
  local body
  if [ "$pad" = maskable ]; then
    # maskable: glyph shrunk into the safe zone (80%)
    body="$(sed 's/<svg /<svg style="transform:scale(0.78);transform-origin:center" /' "$svg")"
  else
    body="$(cat "$svg")"
  fi
  cat > "$OUT/page.html" <<HTML
<!DOCTYPE html><html><head><style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden}
  svg{display:block;width:${size}px;height:${size}px}
</style></head><body>$body</body></html>
HTML
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --default-background-color=00000000 --window-size=$size,$size \
    --screenshot="$out" "file://$OUT/page.html" >/dev/null 2>&1
}

render "$ICONS/logo.svg" "$ICONS/icon-512.png" 512 plain
render "$ICONS/logo.svg" "$ICONS/icon-192.png" 192 plain
render "$ICONS/logo.svg" "$ICONS/icon-maskable-512.png" 512 maskable
render "$ICONS/logo.svg" "$ICONS/icon-maskable-192.png" 192 maskable
echo "webos PWA icons rendered"
