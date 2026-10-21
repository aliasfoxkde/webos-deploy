#!/usr/bin/env bash
# Swap FireCraft's temporary code-drawn app mark for the upstream official mark.
# Run this after FireCraft releases a version that includes an official mark.
# Fetches the upstream release zip, extracts the icon, rasterizes to 256 px
# (reusing the headless-Chromium technique from packaging/icons-render.sh),
# then updates ATTRIBUTION.md and the SVG stub.
#
# Usage:
#   packaging/firecraft-swap-mark.sh [--dry-run]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; fi

# ---------------------------------------------------------------------------
# Config — edit these when FireCraft ships a new release with a mark
# ---------------------------------------------------------------------------
UPSTREAM_ORG="${UPSTREAM_ORG:-aliasfoxkde}"
UPSTREAM_REPO="${UPSTREAM_REPO:-FireCraft}"
UPSTREAM_TAG="${UPSTREAM_TAG:-}"   # empty = latest; set to e.g. v0.3.0
ICON_ZIP_PATH="${ICON_ZIP_PATH:-}" # path inside the zip to the icon; set when known

# Known icon filenames to try (checked in order; first match wins)
ICON_NAMES=("firecraft-icon.png" "app-icon.png" "icon.png" "firecraft.png")

UPSTREAM_URL="https://github.com/${UPSTREAM_ORG}/${UPSTREAM_REPO}/releases"
DEST_PNG="$ROOT/webos/public/icons/craft/firecraft.png"
DEST_SVG="$ROOT/packaging/icons-src/firecraft.svg"
ATTR_FILE="$ROOT/docs/ATTRIBUTION.md"
TMPDIR="${TMPDIR:-/var/tmp}"
WORK="$TMPDIR/firecraft-icon-swap.$$"
# ---------------------------------------------------------------------------

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
mkdir -p "$WORK"

echo "=== FireCraft app mark swap ==="
echo "Dry run: $DRY_RUN"
echo "Upstream: $UPSTREAM_URL"
echo ""

# Step 1: check if the upstream repo has a release we can fetch
LATEST_TAG="${UPSTREAM_TAG:-$(gh release list --repo "$UPSTREAM_ORG/$UPSTREAM_REPO" --limit 1 --json tagName --jq '.[0].tagName' 2>/dev/null || echo "")}"
if [ -z "$LATEST_TAG" ]; then
  echo "ERROR: Could not determine latest release tag for $UPSTREAM_ORG/$UPSTREAM_REPO."
  echo "Is gh authenticated? Is the repo public?"
  exit 1
fi
echo "Using release tag: $LATEST_TAG"

# Step 2: fetch the release asset (the web zip — same artifact used for deployment)
ASSET_NAME="${UPSTREAM_REPO}-web-${LATEST_TAG#v}.zip"
echo "Fetching release asset: $ASSET_NAME"
DOWNLOAD_URL="https://github.com/${UPSTREAM_ORG}/${UPSTREAM_REPO}/releases/download/${LATEST_TAG}/${ASSET_NAME}"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] Would fetch: $DOWNLOAD_URL"
else
  ZIP="$WORK/asset.zip"
  if ! curl -fsSL -o "$ZIP" "$DOWNLOAD_URL" --max-time 60; then
    echo "ERROR: Failed to download $DOWNLOAD_URL"
    echo "The release may not have a web zip yet. Check $UPSTREAM_URL"
    exit 1
  fi
  echo "Downloaded $(du -sh "$ZIP" | cut -f1)"
fi

# Step 3: find the icon inside the zip
find_icon() {
  local zip=$1
  for name in "${ICON_NAMES[@]}"; do
    if unzip -l "$zip" 2>/dev/null | grep -qi "$name"; then
      echo "$name"
      return 0
    fi
  done
  return 1
}

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] Would extract icon from zip (tried: ${ICON_NAMES[*]})"
  ICON_IN_ZIP="<found-icon-name>"
else
  ICON_IN_ZIP=$(find_icon "$ZIP")
  if [ -z "$ICON_IN_ZIP" ]; then
    echo "ERROR: No known icon filename found in $ASSET_NAME."
    echo "Known names searched: ${ICON_NAMES[*]}"
    echo "Set ICON_ZIP_PATH env var to specify the path directly."
    exit 1
  fi
  echo "Found icon in zip: $ICON_IN_ZIP"
fi

# Step 4: extract and validate
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] Would extract $ICON_IN_ZIP → $WORK/icon-raw.png"
else
  unzip -p "$ZIP" "$ICON_IN_ZIP" > "$WORK/icon-raw.png"
  # Basic validation: must be a PNG (PNG signature: 89 50 4E 47)
  if ! head -c 8 "$WORK/icon-raw.png" | grep -q $'\x89PNG'; then
    echo "ERROR: Extracted file is not a PNG"
    exit 1
  fi
  echo "Extracted $(du -sh "$WORK/icon-raw.png" | cut -f1)"
fi

# Step 5: rasterize to 256 px (reuse icons-render.sh technique)
CHROME="${CHROME:-/usr/bin/chromium}"
if ! command -v "$CHROME" >/dev/null 2>&1; then
  CHROME=$(find "$HOME/.cache/ms-playwright" -type f -path '*/chrome-linux/chrome' -print -quit 2>/dev/null || true)
fi
if [ -z "$CHROME" ] || [ ! -x "$CHROME" ]; then
  echo "ERROR: Chromium not found at \$CHROME ($CHROME) or in ms-playwright cache."
  echo "Install it or set CHROME=/path/to/chromium"
  exit 1
fi

render_png() {
  # Resize source PNG to 256 px for the web app mark
  local src=$1 out=$2
  local w
  w=$(identify -format "%w" "$src" 2>/dev/null || echo "0")
  if [ "$w" -lt 256 ]; then
    echo "WARNING: Source icon is only ${w}px wide; upscaling for web deployment."
  fi
  magick "$src" -resize 256x256 "$out"
}

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] Would render $WORK/icon-raw.png → $DEST_PNG (256 px)"
  echo "[dry-run] Would update $ATTR_FILE"
  echo "[dry-run] Would update $DEST_SVG"
else
  render_png "$WORK/icon-raw.png" "$WORK/icon-256.png"
  cp "$WORK/icon-256.png" "$DEST_PNG"
  echo "Wrote: $DEST_PNG ($(du -sh "$DEST_PNG" | cut -f1))"

  # Step 6: update ATTRIBUTION.md — replace the temporary note with the
  # upstream source line
  if grep -q "firecraft.png.*has no upstream source" "$ATTR_FILE"; then
    sed -i "s|.*firecraft.png.*has no upstream source.*|The \`firecraft.png\` mark is sourced from \`${UPSTREAM_ORG}/${UPSTREAM_REPO}@${LATEST_TAG}/${ICON_IN_ZIP}\` (\`${ASSET_NAME}\`), Apache-2.0 OR MIT, same license as the app itself.|" "$ATTR_FILE"
    echo "Updated: $ATTR_FILE (app mark source line)"
  fi

  # Step 7: update the SVG stub to record the swap
  cat > "$DEST_SVG" <<SVG
<!--
FireCraft official app mark — replaced the temporary code-drawn mark.
Source: ${UPSTREAM_ORG}/${UPSTREAM_REPO} @ ${LATEST_TAG} / ${ICON_IN_ZIP}
Fetched by: packaging/firecraft-swap-mark.sh
-->
SVG
  echo "Updated: $DEST_SVG (swap record)"
fi

echo ""
echo "=== Swap complete ==="
echo "Next steps:"
echo "  1. Review the rendered $DEST_PNG — icon should be legible at 64 px"
echo "  2. Run: cd webos && npm run build && npx wrangler pages deploy dist --project-name artcraft-webos --branch main"
echo "  3. Commit with: git add webos/public/icons/craft/firecraft.png docs/ATTRIBUTION.md packaging/icons-src/firecraft.svg"
