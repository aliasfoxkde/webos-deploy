// Documentation-reference gate: every repo-relative path cited in this
// repo's markdown must exist on disk. Docs drift silently otherwise —
// this turns stale references into a red test (same spirit as
// docs-coverage.test.js pinning the Module index). Scope: README.md,
// CLAUDE.md, docs/**/*.md at the repo root. Sibling repos and fetched
// builds are not scanned and refs are not resolved into them.
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
  .filter((e) => e.isDirectory() && !SIBLING_EXCLUDED.has(e.name))
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
    // refs resolving under webos/ keep their prefix; bare refs may cite the
    // repo root or be craft-repo-relative (CLAUDE.md documents the shared
    // repo shape: docs/control-protocol.md, packaging/web/, docs/parity.md)
    const bare = ref.replace(/\/+$/, '');
    const rel = bare.startsWith('webos/')
      ? [bare, bare.slice('webos/'.length)]
      : [bare, `webos/${bare}`,
         ...SIBLINGS.map((s) => `${s}/${bare}`)];
    if (!rel.some((r) => existing.has(r))) {
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
