#!/usr/bin/env node
// Normalize an Aegis scan into the committed baseline.
//
// The baseline is the set of accepted-residual findings; the CI gate fails on
// any finding that is not in it (packaging/aegis-scan.sh). It is regenerated,
// never hand-edited, because a finding's fingerprint is
// "{pattern}:{file}:{line}:{sha256(content)}" — the line number is part of it.
//
// The scanner's raw JSON output is not reproducible byte for byte: it emits
// findings in walk order, gives each finding a timestamp-derived `id`, and
// records the wall clock cost of the scan. Three scans of unchanged source
// therefore differ in thousands of lines, which makes every regeneration a
// whole-file diff that a reviewer cannot read.
//
// This normalizer removes exactly the volatile parts and nothing else:
//
//   * findings are sorted by (file, line, column, pattern) — a total order,
//     verified below, so the sort is deterministic;
//   * the per-finding `id` is dropped (a timestamp nonce);
//   * `stats.scan_time_ms` and `stats.io_time_ms` are dropped (scan timings).
//
// Everything else is preserved verbatim, including `stable_id` and
// `fingerprint`, which are content-derived and stable.
//
// Usage: packaging/aegis-baseline.mjs <raw-scan.json> [out.json]
//   With one argument, the normalized baseline is written to stdout.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath] = process.argv;
if (!inPath) {
  console.error('usage: aegis-baseline.mjs <raw-scan.json> [out.json]');
  process.exit(2);
}

const scan = JSON.parse(readFileSync(inPath, 'utf8'));
if (!Array.isArray(scan.findings)) {
  console.error(`aegis-baseline: ${inPath} has no findings array`);
  process.exit(1);
}

// --- drop the volatile stats ------------------------------------------------
// `scan_time_ms` and `io_time_ms` are wall clock measurements of the scan,
// and `workers_used` is the CPU count the scan happened to use — all three
// vary by machine and run, so they cannot live in a committed baseline.
const { scan_time_ms, io_time_ms, workers_used, ...stats } = scan.stats ?? {};

// The severity and category histograms are keyed by name, but the scanner
// emits them in hash-map order, which changes between runs. Sort them by key
// so the file is reproducible.
for (const field of ['findings_by_severity', 'findings_by_category']) {
  if (stats[field] && typeof stats[field] === 'object') {
    stats[field] = Object.fromEntries(
      Object.entries(stats[field]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  }
}

// --- drop the volatile per-finding id, then sort ------------------------------
const findings = scan.findings.map(({ id, ...finding }) => finding);
findings.sort(
  (a, b) =>
    cmp(a.location.file, b.location.file) ||
    cmp(a.location.line, b.location.line) ||
    cmp(a.location.column, b.location.column) ||
    cmp(a.pattern, b.pattern),
);

function cmp(a, b) {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return a < b ? -1 : 1;
}

// The sort must be a total order, otherwise the output order depends on the
// input order and is not reproducible.
const keys = findings.map((f) => `${f.location.file}|${f.location.line}|${f.location.column}|${f.pattern}`);
if (new Set(keys).size !== keys.length) {
  console.error('aegis-baseline: the sort key is not unique — two findings share a location and pattern');
  process.exit(1);
}

const out = JSON.stringify({ findings, stats }, null, 2) + '\n';
if (outPath) writeFileSync(outPath, out);
else process.stdout.write(out);
