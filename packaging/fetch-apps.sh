#!/usr/bin/env bash
# Sync craft app builds from upstream GitHub releases into apps/.
# This repo never commits app builds — run this to (re)fetch them.
#
# Usage:
#   packaging/fetch-apps.sh                 # fetch any missing app
#   packaging/fetch-apps.sh --force         # refetch + rebuild even if present
#   packaging/fetch-apps.sh --app photocraft [--force]
#
# Requires: gh (authenticated), unzip, sha256sum.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ZIPS="$ROOT/zips"
APPS="$ROOT/apps"
ORG="storytold"          # releases live under the storytold org
FORCE=0
APP=""

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --app) APP="$2"; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

# app version pairs — keep in sync with webos/src/os/registry.js
# Each entry: "<name> <ver>" or "<name> <ver> <org>" (default org = storytold)
APPS_LIST=(
  "cadcraft 0.10.0"
  "deckcraft 0.9.0"
  "designcraft 0.11.0"
  "effectcraft 0.14.0"
  "firecraft 0.2.2 aliasfoxkde"
  "gridcraft 0.10.0"
  "lightcraft 0.11.0"
  "pdfcraft 0.11.0"
  "photocraft 0.12.0"
  "soundcraft 0.11.0"
  "vectorcraft 0.14.0"
  "wordcraft 0.9.0"
)
# NOTE: DeckCraft, SoundCraft and EffectCraft joined this list on 2026-10-21 —
# upstream now publishes a web zip for each, and their source checkouts moved
# out of apps/ to /nas/Temp/repos/<name> so `fetch_one`'s `rm -rf apps/<name>`
# cannot destroy them.

mkdir -p "$ZIPS" "$APPS"

fetch_one() { # name version [org]
  local name=$1 ver=$2 org=${3:-$ORG}
  local zip="$ZIPS/$name-web-$ver.zip" dest="$APPS/$name"
  if [ -d "$dest" ] && [ "$FORCE" -eq 0 ]; then
    echo "== $name $ver: already present (use --force to refetch)"
    return 0
  fi
  if [ ! -f "$zip" ]; then
    echo "== $name $ver: downloading release zip"
    gh release download "v$ver" -R "$org/$name" -p "$name-web-$ver.zip" -D "$ZIPS" --clobber
  fi
  # verify against the release's checksums when published
  if gh release download "v$ver" -R "$org/$name" -p 'SHA256SUMS.txt' -O "$zip.sums" --clobber 2>/dev/null; then
    (cd "$ZIPS" && grep "$name-web-$ver.zip" "$zip.sums" | sed 's|  \*|  |' | sha256sum -c -) \
      || { echo "checksum mismatch for $zip" >&2; exit 1; }
  else
    echo "   (no SHA256SUMS.txt published for $name v$ver — skipping verify)"
  fi
  echo "== $name: unpacking to apps/$name"
  rm -rf "$dest" && mkdir -p "$dest"
  unzip -q "$zip" -d "$dest"          # zips ship with a top-level dir; flatten:
  local inner
  inner="$(find "$dest" -mindepth 1 -maxdepth 1 -type d | head -1)"
  if [ -n "$inner" ] && [ -f "$inner/index.html" ]; then
    (shopt -s dotglob; /bin/mv "$inner"/* "$dest") && rmdir "$inner"
  fi
  "$HERE/pwa-inject.sh" "$dest"
  "$HERE/icons-render.sh" "$name"
}

for entry in "${APPS_LIST[@]}"; do
  # shellcheck disable=SC2086
  set -- $entry
  [ -n "$APP" ] && [ "$1" != "$APP" ] && continue
  # "${3:-$ORG}" — a two-field entry has no org field, and `set -u` would
  # abort on an unbound $3.
  fetch_one "$1" "$2" "${3:-$ORG}"
done
echo "done. builds in apps/ (gitignored — deployed via wrangler, see README)."
