// File-storage bridge: path containment, trust checks, request dispatch.
import { describe, it, expect, vi } from 'vitest';
import {
  appRoot, appOrigin, safeJoin, handleBridge, bridgeRequest, postToApp, MAX_SAVE,
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

describe('bridgeRequest', () => {
  it('resolves the matching reply and ignores unrelated messages', async () => {
    const win = { postMessage: vi.fn() };
    const p = bridgeRequest(win, { type: 'webos:file-list' }, 500);
    expect(win.postMessage).toHaveBeenCalledTimes(1);
    const sent = win.postMessage.mock.calls[0][0];
    expect(sent).toMatchObject({ source: 'webos-app', type: 'webos:file-list' });
    // wrong requestId, wrong source — both ignored
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'webos-host', requestId: 'other', ok: true, payload: 'x' } }));
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'webos-app', requestId: sent.requestId, ok: true, payload: 'x' } }));
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'webos-host', requestId: sent.requestId, ok: true, payload: { files: ['a.txt'] } } }));
    await expect(p).resolves.toEqual({ files: ['a.txt'] });
  });

  it('rejects ok:false replies with the error text', async () => {
    const win = { postMessage: vi.fn() };
    const p = bridgeRequest(win, { type: 'webos:file-open', path: 'x' }, 500);
    const { requestId } = win.postMessage.mock.calls[0][0];
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'webos-host', requestId, ok: false, error: 'not found' } }));
    await expect(p).rejects.toThrow('not found');
  });

  it('times out when no reply ever lands, and stops listening', async () => {
    vi.useFakeTimers();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const p = bridgeRequest({ postMessage: vi.fn() }, { type: 'webos:file-list' }, 50);
    const assertion = expect(p).rejects.toThrow('bridge timeout');
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
    vi.useRealTimers();
    removeSpy.mockRestore();
  });
});

describe('bridge — residual defensive arms', () => {
  function makeFrame() {
    const handlers = {};
    const contentWindow = {
      addEventListener: (evt, h) => { handlers[evt] = h; },
      removeEventListener: (evt, _h) => { delete handlers[evt]; },
      postMessage: vi.fn(),
    };
    const frame = { contentWindow };
    const fire = (data, source = 'firecraft') =>
      handlers['message']?.({ data: { ...data, source } });
    return { frame, contentWindow, fire };
  }

  it('safeJoin returns null for a path that reduces to the root itself', () => {
    expect(safeJoin(appRoot('w'), '.')).toBeNull();
    expect(safeJoin(appRoot('w'), './')).toBeNull();
  });

  it('file-save with an escaping path nacks before touching the blob', async () => {
    const files = fakeFiles();
    const r = await handleBridge(files, APP, evt({
      source: 'webos-app', type: 'webos:file-save', path: '../escape', blob: saveBlob('x'),
    }));
    expect(r).toMatchObject({ ok: false, error: 'invalid path' });
    expect(files.map.size).toBe(0);
  });

  it('file-delete of a missing file nacks with not found', async () => {
    const files = fakeFiles();
    const r = await handleBridge(files, APP, evt({
      source: 'webos-app', type: 'webos:file-delete', path: 'ghost.txt',
    }));
    expect(r).toMatchObject({ ok: false, error: 'not found' });
  });

  it('a throwing files backend surfaces the error message in the nack', async () => {
    const files = { get: async () => { throw new Error('idb closed'); } };
    const r = await handleBridge(files, APP, evt({
      source: 'webos-app', type: 'webos:file-open', path: 'a.txt',
    }));
    expect(r).toMatchObject({ ok: false, error: 'idb closed' });
  });

  it('bridgeRequest rejects with the generic message when ok is falsy without error', async () => {
    const win = { postMessage: vi.fn() };
    const p = bridgeRequest(win, { type: 'webos:file-list' }, 500);
    const { requestId } = win.postMessage.mock.calls[0][0];
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'webos-host', requestId, ok: false } }));
    await expect(p).rejects.toThrow('bridge error');
  });

  it('bridgeRequest falls back to a random id when crypto.randomUUID is absent', async () => {
    const orig = globalThis.crypto?.randomUUID;
    const desc = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
    try {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    } catch {
      // read-only builtin: stub the whole crypto object instead
      vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: undefined });
    }
    const win = { postMessage: vi.fn() };
    const p = bridgeRequest(win, { type: 'webos:file-list' }, 500);
    const sent = win.postMessage.mock.calls[0][0];
    expect(sent.requestId).toMatch(/^req-[a-z0-9]+$/u); // Math.random slice: no dashes after the prefix
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'webos-host', requestId: sent.requestId, ok: true, payload: 1 } }));
    await expect(p).resolves.toBe(1);
    try {
      if (desc) Object.defineProperty(globalThis.crypto, 'randomUUID', desc);
      else if (orig) globalThis.crypto.randomUUID = orig;
    } catch { /* stubbed global restored below */ }
    vi.unstubAllGlobals();
  });

  it('postToApp ignores null-data and mismatched replies; error-less failures use the source in the message', async () => {
    const { frame, contentWindow, fire } = makeFrame();
    let sentId;
    contentWindow.postMessage.mockImplementation((msg) => { sentId = msg.requestId; });
    const p = postToApp(frame, { type: 'ping' }, 'firecraft', 5000);
    window.dispatchEvent(new MessageEvent('message', { data: null })); // null-data guard
    fire({ requestId: sentId, ok: true }, 'other-source'); // wrong source
    fire({ requestId: 'nope', ok: true }, 'firecraft'); // wrong id
    fire({ requestId: sentId, ok: false }, 'firecraft'); // ok:false with no error → source fallback
    await expect(p).rejects.toThrow('firecraft error');
  });
});
