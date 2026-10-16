// Documentation-reference gate: every repo-relative path cited in this
// repo's markdown must exist on disk wherever it can be checked. Docs
// drift silently otherwise — this turns stale references into a red test
// (same spirit as docs-coverage.test.js pinning the Module index).
// Scope: README.md, CLAUDE.md, docs/**/*.md at the repo root. Refs
// resolve first against this repo (root paths and webos/), then against
// the craft-sibling checkouts. CI checks out this repo alone, so refs
// that live only in a sibling (e.g. docs/control-protocol.md) or a
// gitignored tree (apps/<craft>/, zips/) are unverifiable there and are
// skipped — a full checkout with siblings present still verifies them.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..', '..');
const SIBLING_EXCLUDED = new Set(['node_modules', 'dist', 'coverage', 'apps', 'zed',
  'lapce-ide', 'BrowserInBrowser', 'r2-blobs', 'zips', 'docs', 'packaging', 'webos', '.git']);
const WALK_SKIP = new Set(['node_modules', 'dist', 'coverage', 'target', '.git']);

// one-time index of every existing repo-relative path (this repo's tree plus
// each craft sibling's tree), so reference checks are Set lookups instead of
// thousands of statSync calls on a network filesystem
const existing = new Set();
// heavy trees (fetched zips, R2 blobs, unrelated IDE/browser checkouts) are
// indexed one level deep — docs cite them as bare dirs (e.g. `apps/deckcraft/`),
// never deeper; if a doc ever cites deeper, extend indexing rather than
// weakening the check
const ONE_LEVEL = new Set(['apps', 'zips', 'r2-blobs', 'BrowserInBrowser', 'lapce-ide']);
const indexTree = (root, rel = '', top = false) => {
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (WALK_SKIP.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    existing.add(r);
    if (e.isDirectory() && !(top && ONE_LEVEL.has(e.name))) indexTree(join(root, e.name), r);
    if (e.isDirectory() && top && ONE_LEVEL.has(e.name)) {
      for (const c of readdirSync(join(root, e.name), { withFileTypes: true })) {
        if (!WALK_SKIP.has(c.name)) existing.add(`${r}/${c.name}`);
      }
    }
  }
};
const SIBLINGS = readdirSync(REPO, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.')
    && !SIBLING_EXCLUDED.has(e.name))
  .map((e) => e.name);
indexTree(REPO, '', true);
for (const e of readdirSync(REPO, { withFileTypes: true })) {
  if (!e.isDirectory() || SIBLING_EXCLUDED.has(e.name)) continue;
  indexTree(join(REPO, e.name), e.name); // craft siblings, for repo-relative refs
}

const mdFiles = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', 'coverage'].includes(e.name)) continue;
      if (dir === REPO && ['cadcraft', 'designcraft', 'gridcraft', 'lightcraft', 'pdfcraft',
        'photocraft', 'vectorcraft', 'wordcraft', 'apps', 'zed', 'lapce-ide',
        'BrowserInBrowser', 'r2-blobs', 'zips', '.git'].includes(e.name)) continue;
      walk(p);
    } else if (e.name.endsWith('.md')) mdFiles.push(p);
  }
};
walk(REPO);

// backticked tokens that look like repo paths: a known top-level dir (or
// webos/-prefixed), path characters only, ending in a file extension or
// naming a directory. Placeholders and globs are skipped.
const RE = /`((?:webos\/)?(?:src|tests|packaging|docs|public|apps|zips|r2-blobs)\/[A-Za-z0-9_][A-Za-z0-9_./-]*)`/g;
const stale = [];

for (const file of mdFiles) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(RE)) {
    const ref = m[1];
    if (/[<*>\s…]|\bX\.Y\.Z|<name>|<app>/.test(ref)) continue;
    const bare = ref.replace(/\/+$/, '');
    const webosAlt = `webos/${bare}`;
    if (existing.has(bare) || existing.has(webosAlt)) continue;
    // webos-scoped refs — webos/... itself, or src|tests|public meaning
    // webos/<ref> (the repo root has no such dirs) — are checkable in
    // every environment, so a miss is stale, period
    const webosOnly = bare.startsWith('webos/')
      || ['src', 'tests', 'public'].includes(bare.split('/')[0]);
    if (webosOnly) {
      stale.push(`${ref}  (cited in ${file.replace(REPO + '/', '')})`);
      continue;
    }
    // anything else is craft-repo-relative (CLAUDE.md documents the shared
    // repo shape: docs/control-protocol.md, packaging/web/, docs/parity.md)
    // or a gitignored tree — checkable only where those checkouts exist
    if (SIBLINGS.length > 0
      && !SIBLINGS.some((s) => existing.has(`${s}/${bare}`))) {
      stale.push(`${ref}  (cited in ${file.replace(REPO + '/', '')})`);
    }
  }
}

describe('docs references', () => {
  it('scans the repo-root docs (README, CLAUDE.md, docs/**/*.md)', () => {
    expect(mdFiles.length).toBeGreaterThan(10);
  });

  it('every cited repo path exists', () => {
    expect(stale, `${stale.length} stale reference(s)`).toEqual([]);
  });
});
