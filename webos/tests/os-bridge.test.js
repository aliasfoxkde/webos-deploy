// File-storage bridge: path containment, trust checks, request dispatch.
import { describe, it, expect, vi } from 'vitest';
import {
  appRoot, appOrigin, safeJoin, handleBridge, MAX_SAVE,
} from '../src/os/bridge.js';

const APP = { id: 'wordcraft', url: 'https://wordcraft-web.pages.dev/' };
const ORIGIN = 'https://wordcraft-web.pages.dev';

// In-memory stand-in for db.js with the same call shapes.
function fakeFiles(existing = []) {
  const map = new Map(existing.map((r) => [r.path, r]));
  return {
    map,
    async get(path) { return map.get(path); },
    async put(path, blob, type) { map.set(path, { path, blob, type: type ?? blob.type, size: blob.size, mtime: 1 }); },
    async del(path) { map.delete(path); },
    async list() { return [...map.values()]; },
  };
}

const evt = (data, origin = ORIGIN) => ({ data, origin });

const saveBlob = (text = 'hi') => new Blob([text], { type: 'text/plain' });

describe('path containment', () => {
  it('joins relative names under the app root', () => {
    expect(appRoot('wordcraft')).toBe('/Apps/wordcraft');
    expect(safeJoin(appRoot('wordcraft'), 'settings.json')).toBe('/Apps/wordcraft/settings.json');
    expect(safeJoin(appRoot('wordcraft'), 'saves/slot1.json')).toBe('/Apps/wordcraft/saves/slot1.json');
    expect(safeJoin(appRoot('wordcraft'), './a/./b')).toBe('/Apps/wordcraft/a/b');
  });

  it('rejects traversal instead of silently re-rooting', () => {
    expect(safeJoin(appRoot('w'), '../..')).toBeNull();
    expect(safeJoin(appRoot('w'), '../../Home/secret.txt')).toBeNull();
    expect(safeJoin(appRoot('w'), 'a/../b')).toBeNull();
    expect(safeJoin(appRoot('w'), '..')).toBeNull();
  });

  it('rejects empty and absolute names', () => {
    expect(safeJoin(appRoot('w'), '')).toBeNull();
    expect(safeJoin(appRoot('w'), '   ')).toBeNull();
    expect(safeJoin(appRoot('w'), '/etc/passwd')).toBeNull();
  });
});

describe('trust checks', () => {
  it('ignores messages that are not bridge requests', async () => {
    const files = fakeFiles();
    expect(await handleBridge(files, APP, evt(null))).toBeNull();
    expect(await handleBridge(files, APP, evt({ source: 'other', type: 'webos:file-list' }))).toBeNull();
    expect(await handleBridge(files, APP, evt({ source: 'webos-app', type: 'webos:exec' }))).toBeNull();
    expect(await handleBridge(files, APP, evt(undefined))).toBeNull();
    expect(files.map.size).toBe(0);
  });

  it('ignores requests from a foreign origin', async () => {
    const files = fakeFiles();
    const reply = await handleBridge(files, APP, evt({ source: 'webos-app', type: 'webos:file-list' }, 'https://evil.example'));
    expect(reply).toBeNull();
    expect(files.map.size).toBe(0);
  });

  it('resolves the app origin from relative urls against location', () => {
    expect(appOrigin('https://x.example/a/')).toBe('https://x.example');
    expect(appOrigin('bridge-demo.html')).toBe(window.location.origin);
    expect(appOrigin('http://[')).toBeNull(); // unparsable → no origin
  });
});

describe('dispatch', () => {
  it('file-list returns only this app\'s files, names relative', async () => {
    const files = fakeFiles([
      { path: '/Apps/wordcraft/a.txt', type: 'text/plain', size: 3, mtime: 5 },
      { path: '/Apps/wordcraft/sub/b.txt', type: 'text/plain', size: 4, mtime: 6 },
      { path: '/Apps/otherapp/c.txt', type: 'text/plain', size: 9, mtime: 7 },
      { path: '/Home/d.txt', type: 'text/plain', size: 9, mtime: 8 },
      { path: '/Apps/wordcraft', dir: true, mtime: 9 },
    ]);
    const reply = await handleBridge(files, APP, evt({ source: 'webos-app', type: 'webos:file-list', requestId: 'r1' }));
    expect(reply.ok).toBe(true);
    expect(reply.requestId).toBe('r1');
    expect(reply.payload.files).toEqual([
      { path: 'a.txt', type: 'text/plain', size: 3, mtime: 5 },
      { path: 'sub/b.txt', type: 'text/plain', size: 4, mtime: 6 },
    ]);
  });

  it('file-save stores under the root and reports size', async () => {
    const files = fakeFiles();
    const reply = await handleBridge(files, APP, evt({
      source: 'webos-app', type: 'webos:file-save', requestId: 'r2', path: 'notes/today.txt', blob: saveBlob('hello'),
    }));
    expect(reply).toMatchObject({ ok: true, payload: { path: 'notes/today.txt', size: 5 } });
    expect(files.map.has('/Apps/wordcraft/notes/today.txt')).toBe(true);
  });

  it('file-save rejects non-blobs and oversized payloads', async () => {
    const files = fakeFiles();
    const noBlob = await handleBridge(files, APP, evt({ source: 'webos-app', type: 'webos:file-save', path: 'x', blob: 'plain string' }));
    expect(noBlob).toMatchObject({ ok: false, error: 'blob required' });
    // real Blob instance with an inflated size — passes instanceof, fails the cap
    const huge = Object.create(Blob.prototype, { size: { value: MAX_SAVE + 1 } });
    const tooBig = await handleBridge(files, APP, evt({
      source: 'webos-app', type: 'webos:file-save', path: 'x', blob: huge,
    }));
    expect(tooBig.ok).toBe(false);
    expect(tooBig.error).toContain('too large');
    expect(files.map.size).toBe(0);
  });

  it('file-open returns the stored record; missing files nack', async () => {
    const files = fakeFiles([{ path: '/Apps/wordcraft/a.txt', blob: saveBlob('abc'), type: 'text/plain', size: 3, mtime: 5 }]);
    const ok = await handleBridge(files, APP, evt({ source: 'webos-app', type: 'webos:file-open', path: 'a.txt' }));
    expect(ok.ok).toBe(true);
    expect(ok.payload.blob).toBeInstanceOf(Blob);
    expect(await ok.payload.blob.text()).toBe('abc');
    const miss = await handleBridge(files, APP, evt({ source: 'webos-app', type: 'webos:file-open', path: 'nope.txt' }));
    expect(miss).toMatchObject({ ok: false, error: 'not found' });
    const escape = await handleBridge(files, APP, evt({ source: 'webos-app', type: 'webos:file-open', path: '../otherapp/c.txt' }));
    expect(escape).toMatchObject({ ok: false, error: 'invalid path' });
  });

  it('file-delete removes only the app\'s own files', async () => {
    const files = fakeFiles([
      { path: '/Apps/wordcraft/a.txt', size: 1, mtime: 1 },
      { path: '/Apps/other/b.txt', size: 1, mtime: 1 },
    ]);
    const del = await handleBridge(files, APP, evt({ source: 'webos-app', type: 'webos:file-delete', path: 'a.txt' }));
    expect(del.ok).toBe(true);
    expect(files.map.has('/Apps/wordcraft/a.txt')).toBe(false);
    const foreign = await handleBridge(files, APP, evt({ source: 'webos-app', type: 'webos:file-delete', path: '../other/b.txt' }));
    expect(foreign.ok).toBe(false);
    expect(files.map.has('/Apps/other/b.txt')).toBe(true);
  });

  it('storage failures become ok:false replies, not throws', async () => {
    const files = { get: vi.fn(async () => { throw new Error('idb closed'); }), put: vi.fn(), del: vi.fn(), list: vi.fn(async () => []) };
    const reply = await handleBridge(files, APP, evt({ source: 'webos-app', type: 'webos:file-open', path: 'x' }));
    expect(reply).toMatchObject({ ok: false, error: 'idb closed' });
  });
});
