#!/usr/bin/env bash
# Aegis security scan — the CI gate.
#
# Aegis is a Rust scanner published as release binaries at
# https://github.com/aliasfoxkde/aegis (the PyPI package `aegis-cli` is an
# unrelated project — it scaffolds starter files and cannot scan).
#
# The scanner version is pinned and the tarball checksum is verified, so the
# gate fails loudly on a tampered or substituted download rather than
# silently scanning with something else.
#
# Exit code: aegis exits non-zero only when the scan finds findings that are
# NOT in the baseline (accepted residuals, triaged by hand in
# docs/planning/QUALITY-PROGRAM.md). An empty result exits 0.
#
# Usage:
#   packaging/aegis-scan.sh                 # scan webos/src against the baseline
#   AEGIS_VERSION=v0.6.4 packaging/aegis-scan.sh
#
# The baseline is webos/.aegis-baseline.json and must be regenerated with the
# SAME pinned scanner version — see docs/planning/QUALITY-PROGRAM.md.

set -euo pipefail

AEGIS_VERSION="${AEGIS_VERSION:-v0.6.4}"
AEGIS_SHA256="${AEGIS_SHA256:-cba86099574d76c3c31104bf0a006b6dddb3379cc921aef07f322cb2a8a7ee4c}"
AEGIS_ASSET="aegis-linux-x86_64.tar.gz"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBOS_DIR="$REPO_ROOT/webos"
BASELINE="$WEBOS_DIR/.aegis-baseline.json"

WORK_DIR="${AEGIS_WORK_DIR:-${TMPDIR:-/var/tmp}/aegis-$AEGIS_VERSION}"
AEGIS_BIN="$WORK_DIR/aegis"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "aegis-scan: required tool '$1' not found in PATH" >&2
    exit 2
  }
}

need tar
need sha256sum

# CI runners differ in what they ship: the GitHub runner has curl, the
# GitForge image (node:24-trixie-slim) does not, but it always has node.
fetch() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$dest" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$dest" "$url"
  else
    node -e 'const [u,d]=process.argv.slice(1);fetch(u).then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer()}).then(b=>require("fs").writeFileSync(d,Buffer.from(b)))' "$url" "$dest"
  fi
}

install_aegis() {
  if [ -x "$AEGIS_BIN" ]; then
    return
  fi
  mkdir -p "$WORK_DIR"
  local tarball="$WORK_DIR/$AEGIS_ASSET"
  echo "aegis-scan: fetching aegis $AEGIS_VERSION ($AEGIS_ASSET)"
  fetch "https://github.com/aliasfoxkde/aegis/releases/download/$AEGIS_VERSION/$AEGIS_ASSET" "$tarball"
  echo "$AEGIS_SHA256  $tarball" | sha256sum -c - >/dev/null
  # The upstream tarball pins SOURCE_DATE_EPOCH to a sentinel value, which
  # tar reports as an implausibly old timestamp. The mtime is irrelevant here.
  tar --warning=no-timestamp -xzf "$tarball" -C "$WORK_DIR" aegis
  chmod +x "$AEGIS_BIN"
}

install_aegis

echo "aegis-scan: $("$AEGIS_BIN" --version) scanning webos/src against $(basename "$BASELINE")"
cd "$WEBOS_DIR"
set +e
"$AEGIS_BIN" --format sarif scan src --baseline "$BASELINE" > "$WORK_DIR/aegis-report.sarif"
status=$?
set -e

if [ "$status" -ne 0 ]; then
  echo "aegis-scan: FAILED — findings not present in the baseline:" >&2
  "$AEGIS_BIN" --format human scan src --baseline "$BASELINE" >&2 || true
  exit "$status"
fi

echo "aegis-scan: PASS — no findings beyond the triaged baseline"
