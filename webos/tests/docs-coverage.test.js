// Documentation-coverage gate: the Module index in
// docs/planning/webos-apps/ARCHITECTURE.md must name every file under src/
// with a real one-line description. Two-way: a new source file without a row
// fails here, and a row whose file was deleted fails here — the docs can no
// longer drift from the tree they describe.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DOC = '../docs/planning/webos-apps/ARCHITECTURE.md';

const srcFiles = (dir = 'src') =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return srcFiles(p);
    return [p];
  });

const section = readFileSync(DOC, 'utf8').split(/^## Module index$/m)[1] ?? '';
const rows = [...section.matchAll(/^- `([^`]+)` — (.+)$/gm)].map((m) => [m[1], m[2]]);

describe('docs coverage — ARCHITECTURE.md Module index', () => {
  it('names every file under src/ exactly once, with no stale rows', () => {
    const listed = rows.map(([path]) => path);
    expect(listed.sort()).toEqual(srcFiles().sort());
    expect(new Set(listed).size, 'a row is duplicated').toBe(listed.length);
  });

  it('describes every module in a real sentence (no placeholders)', () => {
    for (const [path, desc] of rows) {
      expect(desc.length, path).toBeGreaterThan(30);
      expect(desc, path).toMatch(/[a-z]/);
      expect(desc, path).not.toMatch(/\b(TODO|FIXME|TBD|stub|placeholder)\b/i);
    }
  });
});
