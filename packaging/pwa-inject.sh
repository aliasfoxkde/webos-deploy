#!/usr/bin/env bash
# Inject PWA wiring (manifest, icons, service worker, index.html tags) into each
# unpacked {app}-web build in apps/. Idempotent: skips apps already injected.
#
# Icons are original geometric artwork drawn for this deployment (the clean-room
# rule forbids vendor iconography); rasterized from SVG with ImageMagick.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPS="$HERE/apps"

# app            display        description                                      accent    glyph-svg (512 viewBox)
inject_app() {
  local app=$1 display=$2 desc=$3 accent=$4 version=$5 glyph=$6
  local dir="$APPS/$app"
  local icon="$APPS/$app/icons"
  [ -f "$dir/index.html" ] || { echo "error: $dir/index.html missing" >&2; return 1; }
  if grep -q 'manifest.webmanifest' "$dir/index.html"; then echo "$app: already injected"; return 0; fi

  # App boot background: first background: #hex in its index.html (theme flash match).
  local bg
  bg=$(grep -om1 'background: #[0-9a-fA-F]\{3,8\}' "$dir/index.html" | grep -om1 '#[0-9a-fA-F]\{3,8\}' || echo '#1b1e24')
  bg=$(echo "$bg" | tr 'A-F' 'a-f')

  mkdir -p "$icon"

  # --- icon.svg (free-floating: rounded square + glyph) ---
  cat > "$icon/icon.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect x="16" y="16" width="480" height="480" rx="96" fill="$bg"/>
  <rect x="16" y="16" width="480" height="480" rx="96" fill="none" stroke="$accent" stroke-width="16" opacity="0.55"/>
  <g stroke="$accent" stroke-width="24" fill="none" stroke-linecap="round" stroke-linejoin="round">
$glyph
  </g>
</svg>
SVG

  # --- icon-maskable.svg: glyph pulled into the 80% safe zone ---
  sed 's|<g stroke=|<g transform="translate(256,256) scale(0.66) translate(-256,-256)" stroke=|' "$icon/icon.svg" > "$icon/icon-maskable.svg"
  # maskable variant paints the full bleed (no inset rect): replace x/y/w/h of bg rect
  sed -i 's|<rect x="16" y="16" width="480" height="480" rx="96"|<rect x="0" y="0" width="512" height="512" rx="0"|g' "$icon/icon-maskable.svg"

  magick -background none "$icon/icon.svg"        -resize 192x192 "$icon/icon-192.png"
  magick -background none "$icon/icon.svg"        -resize 512x512 "$icon/icon-512.png"
  magick -background none "$icon/icon-maskable.svg" -resize 192x192 "$icon/icon-maskable-192.png"
  magick -background none "$icon/icon-maskable.svg" -resize 512x512 "$icon/icon-maskable-512.png"

  # --- manifest.webmanifest ---
  cat > "$dir/manifest.webmanifest" <<JSON
{
  "name": "$display",
  "short_name": "$display",
  "description": "$desc",
  "id": "./",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "background_color": "$bg",
  "theme_color": "$bg",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
JSON

  # --- sw.js: minimal offline shell (network-first pages, cache-first assets) ---
  cat > "$dir/sw.js" <<JS
// Minimal PWA service worker injected by the webos-deploy packaging.
const CACHE = '$app-web-$version';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
  } else {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});
JS

  # --- index.html: head tags + SW registration ---
  local head_snip sw_snip
  head_snip="  <link rel=\"manifest\" href=\"manifest.webmanifest\">
  <link rel=\"icon\" type=\"image/svg+xml\" href=\"icons/icon.svg\">
  <link rel=\"apple-touch-icon\" href=\"icons/icon-192.png\">
  <meta name=\"theme-color\" content=\"$bg\">
  <meta name=\"mobile-web-app-capable\" content=\"yes\">
  <meta name=\"apple-mobile-web-app-capable\" content=\"yes\">
  <meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\">
  <meta name=\"apple-mobile-web-app-title\" content=\"$display\">
  <title>$display</title>
"
  sw_snip="  <script>if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('./sw.js')})}</script>
"
  awk -v ins="$head_snip" 'BEGIN{d=0} /<\/head>/{printf "%s", ins; d=1} {print}' "$dir/index.html" > "$dir/.idx.tmp"
  awk -v ins="$sw_snip" '/<\/body>/{printf "%s", ins} {print}' "$dir/.idx.tmp" > "$dir/index.html"
  rm -f "$dir/.idx.tmp"

  echo "$app: injected (v$version, bg $bg, accent $accent)"
}

# ---- app table -------------------------------------------------------------
inject_app cadcraft    "CADCraft"    "2D/3D CAD and drafting"                "#22d3ee" "0.3.0" '
    <path d="M256 96 400 176 400 336 256 416 112 336 112 176 Z"/>
    <path d="M112 176 256 256 400 176"/>
    <path d="M256 256 256 416"/>'

inject_app designcraft "DesignCraft" "Page layout and desktop publishing"    "#e879f9" "0.4.0" '
    <rect x="112" y="112" width="120" height="288" rx="16"/>
    <rect x="264" y="112" width="136" height="120" rx="16"/>
    <path d="M264 280h136M264 336h136"/>'

inject_app gridcraft   "GridCraft"   "Spreadsheets and data"                 "#34d399" "0.3.0" '
    <path d="M112 128h288M112 226h288M112 324h288"/>
    <path d="M112 128v256M205 128v256M307 128v256M400 128v256"/>
    <rect x="205" y="226" width="102" height="98" fill="#34d399" stroke="none"/>'

inject_app lightcraft  "LightCraft"  "Photo library and raw development"     "#fbbf24" "0.4.0" '
    <circle cx="256" cy="176" r="64"/>
    <path d="M256 64v-8M256 296v8M152 176h-8M368 176h-8" stroke-width="20"/>
    <path d="M136 368h240M176 424h160"/>
    <circle cx="200" cy="368" r="18" fill="#fbbf24" stroke="none"/>
    <circle cx="320" cy="424" r="18" fill="#fbbf24" stroke="none"/>'

inject_app pdfcraft    "PdfCraft"    "PDF documents"                          "#f87171" "0.4.0" '
    <path d="M144 80h160l64 64v288H144 Z"/>
    <path d="M304 80v64h64"/>
    <path d="M192 240h128M192 292h128M192 344h80"/>'

inject_app photocraft  "PhotoCraft"  "Image editing"                          "#60a5fa" "0.5.0" '
    <circle cx="256" cy="256" r="144"/>
    <circle cx="256" cy="256" r="56"/>
    <path d="M256 112v88M370 190l-74 44M370 322l-74-44M256 400v-88M142 322l74-44M142 190l74 44"/>'

inject_app vectorcraft "VectorCraft" "Vector illustration"                    "#a78bfa" "0.7.0" '
    <path d="M144 368C144 240 240 240 256 176 268 128 320 112 368 144"/>
    <rect x="120" y="344" width="48" height="48" rx="8" fill="#a78bfa" stroke="none"/>
    <rect x="344" y="120" width="48" height="48" rx="8" fill="#a78bfa" stroke="none"/>'

inject_app wordcraft   "WordCraft"   "Word processing"                        "#818cf8" "0.3.0" '
    <path d="M136 80h176l64 64v288H136 Z"/>
    <path d="M184 216h144M184 264h144M184 312h96"/>'

echo "done"
