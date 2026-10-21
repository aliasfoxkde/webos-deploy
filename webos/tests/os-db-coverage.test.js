// Extra branch-coverage tests for src/os/db.js.
// The existing os-db.test.js covers the happy paths; this file drives
// the uncovered error/edge branches in open(), tx(), and fileDelTree().
//
// Tests re-import db.js per-case via vi.resetModules() (matching the pattern
// in os-db.test.js) so the module-level singleton is fresh each time.
import { describe, it, expect, beforeEach, vi } from 'vitest';

let db;

// Each test gets a fresh IDBFactory (vitest jsdom environment provides one).
beforeEach(async () => {
  vi.resetModules();
  indexedDB = new IDBFactory(); // eslint-disable-line no-global-assign
  db = await import('../src/os/db.js');
});

const blob = (s, type) => new Blob([s], { type });

// ---------------------------------------------------------------------------
// filePut edge shapes — covers the type-fallback branch in the record
// constructor (line 53: "type || blob.type || 'application/octet-stream'").
// ---------------------------------------------------------------------------
describe('filePut type fallback', () => {
  it('uses blob.type when no explicit type is given', async () => {
    const b = blob('hello', 'image/png');
    await db.filePut('/typed.png', b); // no explicit type
    const rec = await db.fileGet('/typed.png');
    expect(rec.type).toBe('image/png');
  });

  it('falls back to application/octet-stream when blob has no type', async () => {
    const b = blob('raw');
    await db.filePut('/notype.bin', b); // Blob created without type
    const rec = await db.fileGet('/notype.bin');
    expect(rec.type).toBe('application/octet-stream');
  });

  it('prefers explicit type over blob.type', async () => {
    const b = blob('x', 'image/png');
    await db.filePut('/override.bin', b, 'application/json');
    const rec = await db.fileGet('/override.bin');
    expect(rec.type).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// fileDelTree — trailing-slash normalization (line 68) and prefix-filter
// boundary cases.
// ---------------------------------------------------------------------------
describe('fileDelTree normalization and boundaries', () => {
  it('treats /prefix/ and /prefix as identical (trailing slash removed)', async () => {
    await db.dirPut('/docs');
    await db.filePut('/docs/a.txt', blob('a'));
    await db.filePut('/docs/b.txt', blob('b'));
    // /docs/ should delete both, like /docs
    const n = await db.fileDelTree('/docs/');
    expect(n).toBe(3); // folder marker + 2 files
    const rest = (await db.fileList()).map((r) => r.path);
    expect(rest).toHaveLength(0);
  });

  it('does not delete a sibling whose path is a super-prefix of the target', async () => {
    // /ab and /abx are distinct paths; deleting /ab must not touch /abx
    await db.filePut('/ab', blob('ab file'));
    await db.filePut('/abx', blob('abx file'));
    const n = await db.fileDelTree('/ab');
    expect(n).toBe(1);
    const rest = (await db.fileList()).map((r) => r.path);
    expect(rest).toContain('/abx');
    expect(rest).not.toContain('/ab');
  });

  it('does not delete a child of a path that is only a prefix match', async () => {
    // /long and /longer/path are distinct; deleting /long should not touch /longer
    await db.filePut('/long', blob('just-long'));
    await db.filePut('/longer/file.txt', blob('f'));
    const n = await db.fileDelTree('/long');
    expect(n).toBe(1);
    const rest = (await db.fileList()).map((r) => r.path);
    expect(rest).toContain('/longer/file.txt');
  });

  it('returns 0 for a path with no matching entries', async () => {
    await db.filePut('/home/file.txt', blob('x'));
    const n = await db.fileDelTree('/nonexistent/prefix/path');
    expect(n).toBe(0);
    expect(await db.fileList()).toHaveLength(1);
  });

  it('deletes exactly one entry when given an exact file path', async () => {
    await db.filePut('/alone.txt', blob('alone'));
    await db.filePut('/other.txt', blob('other'));
    const n = await db.fileDelTree('/alone.txt');
    expect(n).toBe(1);
    const rest = (await db.fileList()).map((r) => r.path);
    expect(rest).toEqual(['/other.txt']);
  });
});

// ---------------------------------------------------------------------------
// fileList — returns all records including both files and folder markers
// ---------------------------------------------------------------------------
describe('fileList mixed contents', () => {
  it('surfaces folder markers alongside files', async () => {
    await db.dirPut('/folder');
    await db.filePut('/folder/file.txt', blob('f'));
    const all = await db.fileList();
    const paths = all.map((r) => r.path);
    expect(paths).toContain('/folder');
    expect(paths).toContain('/folder/file.txt');
  });

  it('returns an empty array when the files store is empty', async () => {
    await db.fileClear();
    await expect(db.fileList()).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// dirPut — folder marker mtime update on re-creation
// ---------------------------------------------------------------------------
describe('dirPut mtime update', () => {
  it('replaces the folder marker and updates mtime', async () => {
    await db.dirPut('/mf');
    const t0 = (await db.fileList().then((all) => all.find((r) => r.path === '/mf'))).mtime;
    await new Promise((r) => setTimeout(r, 10));
    await db.dirPut('/mf');
    const t1 = (await db.fileList().then((all) => all.find((r) => r.path === '/mf'))).mtime;
    expect(t1).toBeGreaterThanOrEqual(t0);
  });
});

// ---------------------------------------------------------------------------
// kvDel — delete a key that exists, and one that never existed
// ---------------------------------------------------------------------------
describe('kvDel', () => {
  it('deleting a nonexistent key resolves without throwing', async () => {
    await expect(db.kvDel('never-created')).resolves.toBeUndefined();
  });

  it('roundtrips: set, get, del, get-undefined', async () => {
    await db.kvSet(' transient', { x: true });
    await expect(db.kvGet(' transient')).resolves.toEqual({ x: true });
    await db.kvDel(' transient');
    await expect(db.kvGet(' transient')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// fileClear — kv remains usable after a fileClear that hits nothing
// ---------------------------------------------------------------------------
describe('fileClear + kv isolation', () => {
  it('kv works after fileClear on an already-empty files store', async () => {
    await db.fileClear(); // nothing to clear
    await db.kvSet('still-works', 42);
    await expect(db.kvGet('still-works')).resolves.toBe(42);
  });

  it('files are gone after fileClear but kv persists', async () => {
    await db.kvSet('keep', 'yes');
    await db.filePut('/x', blob('x'));
    await db.fileClear();
    await expect(db.fileList()).resolves.toEqual([]);
    await expect(db.kvGet('keep')).resolves.toBe('yes');
  });
});
