#!/usr/bin/env bash
# Regenerate webos/.aegis-baseline.json with the pinned Aegis scanner.
#
# The baseline is the set of accepted-residual findings: the gate fails on
# any finding that is not in it. It must be regenerated (never hand-edited)
# whenever a line shift moves a fingerprint — a fingerprint is
# "{pattern}:{file}:{line}:{sha256(content)}", so the line number is part of
# it.
#
# The written file is normalized by packaging/aegis-baseline.mjs so that two
# scans of the same source produce byte-identical baselines: the scanner
# emits findings in walk order, gives each finding a timestamp-derived `id`,
# and records the wall clock cost of the scan, all of which vary per run.
#
# The script refuses to install a baseline that does not pass the gate, and
# refuses to install one whose finding set drifted beyond line shifts.
#
# Usage: packaging/aegis-baseline.sh [--check]
#   --check  regenerate into a temp file and report the drift against the
#            committed baseline without writing anything (exit 1 on drift)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
WEBOS_DIR="$ROOT/webos"
BASELINE="$WEBOS_DIR/.aegis-baseline.json"
AEGIS_VERSION="${AEGIS_VERSION:-v0.6.4}"
WORK_DIR="${AEGIS_WORK_DIR:-${TMPDIR:-/var/tmp}/aegis-$AEGIS_VERSION}"

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "aegis-baseline: required tool '$1' not found in PATH" >&2
    exit 2
  }
}
need node
need sha256sum

# --- the scanner ------------------------------------------------------------
# Reuse the pinned binary the gate uses (packaging/aegis-scan.sh downloads and
# verifies it); fall back to a local install of the same version.
AEGIS_BIN="$WORK_DIR/aegis"
if [ ! -x "$AEGIS_BIN" ]; then
  if [ -x "$HOME/.local/bin/aegis" ] && \
     [ "$("$HOME/.local/bin/aegis" --version)" = "aegis ${AEGIS_VERSION#v}" ]; then
    AEGIS_BIN="$HOME/.local/bin/aegis"
  else
    echo "aegis-baseline: aegis $AEGIS_VERSION not found; run packaging/aegis-scan.sh once to install it" >&2
    exit 2
  fi
fi

echo "aegis-baseline: scanning webos/src with $("$AEGIS_BIN" --version)"
mkdir -p "$WORK_DIR"
RAW="$WORK_DIR/aegis-raw-$$.json"
NEW="$WORK_DIR/aegis-normalized-$$.json"
trap 'rm -f "$RAW" "$NEW"' EXIT

( cd "$WEBOS_DIR" && "$AEGIS_BIN" --format json scan src > "$RAW" ) || true

[ -s "$RAW" ] || { echo "aegis-baseline: the scan produced no output" >&2; exit 1; }

node "$HERE/aegis-baseline.mjs" "$RAW" "$NEW"

# --- drift check ------------------------------------------------------------
# The semantic set (pattern, category, severity, file, description) must not
# change: only the line numbers may move. Anything else is new or removed
# content and needs a human decision, not a regeneration.
sem() {
  jq -r '.findings[] | [.pattern,.category,.severity,.location.file,.description] | @tsv' "$1" | sort
}
if [ -f "$BASELINE" ]; then
  if ! diff <(sem "$BASELINE") <(sem "$NEW") > "$WORK_DIR/aegis-semantic-diff-$$.txt"; then
    echo "aegis-baseline: FAILED — the finding set changed beyond line shifts:" >&2
    diff <(sem "$BASELINE") <(sem "$NEW") | head -40 >&2
    echo "(review the new findings, triage them, then re-run)" >&2
    exit 1
  fi
  old_n=$(jq '.findings | length' "$BASELINE")
  new_n=$(jq '.findings | length' "$NEW")
  moved=$(diff <(jq -r '.findings[] | .fingerprint' "$BASELINE" | sort) \
               <(jq -r '.findings[] | .fingerprint' "$NEW" | sort) | grep -c '^<' || true)
  echo "aegis-baseline: $old_n findings before, $new_n after; $moved fingerprints moved (line shifts)"
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  if cmp -s "$NEW" "$BASELINE"; then
    echo "aegis-baseline: PASS — the committed baseline matches a fresh scan"
  else
    echo "aegis-baseline: DRIFT — the committed baseline differs from a fresh scan" >&2
    diff "$BASELINE" "$NEW" | head -40 >&2
    exit 1
  fi
  exit 0
fi

# --- install and verify -----------------------------------------------------
/bin/cp -f "$NEW" "$BASELINE"
if ! bash "$HERE/aegis-scan.sh" | tail -1 | grep -q "PASS"; then
  echo "aegis-baseline: FAILED — the new baseline does not pass the gate" >&2
  exit 1
fi
echo "aegis-baseline: installed $BASELINE"
