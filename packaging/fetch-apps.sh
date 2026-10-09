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
APPS_LIST=(
  "cadcraft 0.3.0"
  "designcraft 0.4.0"
  "gridcraft 0.3.0"
  "lightcraft 0.4.0"
  "pdfcraft 0.4.0"
  "photocraft 0.5.0"
  "vectorcraft 0.7.0"
  "wordcraft 0.3.0"
)

mkdir -p "$ZIPS" "$APPS"

fetch_one() { # name version
  local name=$1 ver=$2 zip="$ZIPS/$1-web-$2.zip" dest="$APPS/$1"
  if [ -d "$dest" ] && [ "$FORCE" -eq 0 ]; then
    echo "== $1 $ver: already present (use --force to refetch)"
    return 0
  fi
  if [ ! -f "$zip" ]; then
    echo "== $1 $ver: downloading release zip"
    gh release download "v$ver" -R "$ORG/$name" -p "$name-web-$ver.zip" -D "$ZIPS" --clobber
  fi
  # verify against the release's checksums when published
  if gh release download "v$ver" -R "$ORG/$name" -p 'SHA256SUMS.txt' -O "$zip.sums" --clobber 2>/dev/null; then
    (cd "$ZIPS" && grep "$name-web-$ver.zip" "$zip.sums" | sed 's|  \*|  |' | sha256sum -c -) \
      || { echo "checksum mismatch for $zip" >&2; exit 1; }
  else
    echo "   (no SHA256SUMS.txt published for $1 v$ver — skipping verify)"
  fi
  echo "== $1: unpacking to apps/$1"
  rm -rf "$dest" && mkdir -p "$dest"
  unzip -q "$zip" -d "$dest"          # zips ship with a top-level dir; flatten:
  local inner
  inner="$(find "$dest" -mindepth 1 -maxdepth 1 -type d | head -1)"
  if [ -n "$inner" ] && [ -f "$inner/index.html" ]; then
    (shopt -s dotglob; /bin/mv "$inner"/* "$dest") && rmdir "$inner"
  fi
  "$HERE/pwa-inject.sh" "$dest"
  "$HERE/icons-render.sh" "$1"
}

for entry in "${APPS_LIST[@]}"; do
  set -- $entry
  [ -n "$APP" ] && [ "$1" != "$APP" ] && continue
  fetch_one "$1" "$2"
done
echo "done. builds in apps/ (gitignored — deployed via wrangler, see README)."
