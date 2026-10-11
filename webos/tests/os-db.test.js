// os/db.js against a real (fake-indexeddb) IndexedDB: kv roundtrips, the
// files virtual disk (records carry type/size/mtime), folder markers, and
// recursive tree delete. Each test gets a fresh module instance so the
// memoized connection doesn't leak rows between cases.
import { describe, it, expect, beforeEach, vi } from 'vitest';

let db;

beforeEach(async () => {
  vi.resetModules();
  indexedDB = new IDBFactory(); // eslint-disable-line no-global-assign
  db = await import('../src/os/db.js');
});

const blob = (s, type) => new Blob([s], { type });

describe('kv store', () => {
  it('roundtrips structured values and deletes them', async () => {
    await db.kvSet('n', 42);
    await db.kvSet('obj', { a: [1, 2] });
    await expect(db.kvGet('n')).resolves.toBe(42);
    await expect(db.kvGet('obj')).resolves.toEqual({ a: [1, 2] });
    await db.kvDel('n');
    await expect(db.kvGet('n')).resolves.toBeUndefined();
  });

  it('missing keys resolve undefined without throwing', async () => {
    await expect(db.kvGet('never')).resolves.toBeUndefined();
  });
});

describe('files store', () => {
  it('filePut stores path/blob/type/size/mtime and fileGet reads it back', async () => {
    const b = blob('hello', 'text/plain');
    await db.filePut('/Home/a.txt', b, 'text/plain');
    const rec = await db.fileGet('/Home/a.txt');
    expect(rec.path).toBe('/Home/a.txt');
    expect(rec.type).toBe('text/plain');
    expect(rec.size).toBe(5);
    expect(typeof rec.mtime).toBe('number');
    expect(rec.blob).toBeTruthy(); // structured-clone of the blob survives the roundtrip
  });

  it('a replaced file keeps its path and updates size', async () => {
    await db.filePut('/Home/r.txt', blob('12345', 'text/plain'));
    await db.filePut('/Home/r.txt', blob('123456789', 'text/plain'));
    expect((await db.fileGet('/Home/r.txt')).size).toBe(9);
  });

  it('filePut defaults the type from the blob, then to octet-stream', async () => {
    await db.filePut('/Home/b.txt', blob('x', 'image/png'));
    expect((await db.fileGet('/Home/b.txt')).type).toBe('image/png');
    await db.filePut('/Home/c.bin', blob('y'));
    expect((await db.fileGet('/Home/c.bin')).type).toBe('application/octet-stream');
  });

  it('dirPut writes a folder marker and fileList surfaces both kinds', async () => {
    await db.dirPut('/Home/docs');
    await db.filePut('/Home/docs/d.txt', blob('d'));
    const all = await db.fileList();
    expect(all.length).toBe(2);
    expect(all.find((r) => r.path === '/Home/docs').dir).toBe(true);
    expect(all.find((r) => r.path === '/Home/docs/d.txt').dir).toBeUndefined();
  });

  it('fileDel removes one record', async () => {
    await db.filePut('/Home/gone.txt', blob('g'));
    await db.fileDel('/Home/gone.txt');
    await expect(db.fileGet('/Home/gone.txt')).resolves.toBeUndefined();
  });

  it('fileClear empties the store but leaves kv alone', async () => {
    await db.kvSet('keep', 1);
    await db.filePut('/Home/x', blob('x'));
    await db.fileClear();
    await expect(db.fileList()).resolves.toEqual([]);
    await expect(db.kvGet('keep')).resolves.toBe(1);
  });
});

describe('fileDelTree', () => {
  const seed = async () => {
    await db.dirPut('/Home/docs');
    await db.filePut('/Home/docs/a.txt', blob('a'));
    await db.filePut('/Home/docs/sub/b.txt', blob('b'));
    await db.filePut('/Home/other.txt', blob('o'));
  };

  it('deletes the folder marker and everything under the prefix', async () => {
    await seed();
    const n = await db.fileDelTree('/Home/docs');
    expect(n).toBe(3);
    const rest = await db.fileList();
    expect(rest.map((r) => r.path)).toEqual(['/Home/other.txt']);
  });

  it('accepts a prefix with a trailing slash', async () => {
    await seed();
    expect(await db.fileDelTree('/Home/docs/')).toBe(3);
  });

  it('deleting a single file path removes exactly that record', async () => {
    await seed();
    expect(await db.fileDelTree('/Home/other.txt')).toBe(1);
  });

  it('returns 0 for an unknown prefix', async () => {
    await seed();
    expect(await db.fileDelTree('/Home/nope')).toBe(0);
  });
});
