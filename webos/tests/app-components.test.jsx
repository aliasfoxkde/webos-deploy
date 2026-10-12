// Plugin chunk wiring: APP_COMPONENTS maps app ids to lazy imports so each
// plugin ships as its own chunk. Direct static imports in other suites never
// execute those arrows — only launching the app through the real shell does.
// This launches every lazy plugin and waits out <Suspense>, asserting each
// window mounts real DOM. db.js is faked so Files reads a hermetic disk.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import App from '../src/App.jsx';
import { OSProvider } from '../src/os/state.jsx';

const h = vi.hoisted(() => ({ files: [], kv: new Map() }));

vi.mock('../src/os/db.js', () => ({
  fileList: async () => h.files,
  fileGet: async (path) => {
    const r = h.files.find((f) => f.path === path && !f.dir);
    return r ? { blob: r.blob, type: r.type } : null;
  },
  filePut: async (path, blob, type) => {
    h.files = h.files.filter((f) => f.path !== path);
    h.files.push({ path, dir: false, type: type || blob.type || '', size: blob.size, mtime: 1, blob });
  },
  fileDel: async (path) => { h.files = h.files.filter((f) => f.path !== path); },
  fileDelTree: async (path) => { h.files = h.files.filter((f) => f.path !== path && !f.path.startsWith(`${path}/`)); },
  dirPut: async (path) => { if (!h.files.some((f) => f.path === path)) h.files.push({ path, dir: true, mtime: 1 }); },
  kvGet: async (k) => h.kv.get(k),
  kvSet: async (k, v) => { h.kv.set(k, v); },
  kvDel: async (k) => { h.kv.delete(k); },
}));

const ctx2d = () => new Proxy({}, {
  get(_, prop) { return prop === 'canvas' ? undefined : () => {}; },
  set() { return true; },
});

beforeEach(() => {
  localStorage.clear();
  h.files = [];
  h.kv.clear();
  if (!window.ResizeObserver) {
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  vi.stubGlobal('fetch', () => new Promise(() => {})); // browser/weather/chat stay hermetic
  vi.stubGlobal('requestAnimationFrame', () => 1); // taskmgr's frame loop idles
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('PerformanceObserver', undefined); // taskmgr's honest fallback
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: (type) => (type === '2d' ? ctx2d() : null), configurable: true, writable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'getContext');
  vi.unstubAllGlobals();
  cleanup();
});

// Lazy chunk resolution races the macro-task queue — drain until every
// window has left its "Starting …" Suspense fallback (bounded, then asserted).
const settle = async () => {
  for (let i = 0; i < 100 && document.body.textContent.includes('Starting '); i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
};

const LAZY_APPS = ['browser', 'video', 'weather', 'files', 'chat', 'notepad', 'taskmgr'];

describe('lazy plugin chunks', () => {
  it('launching every lazy app resolves its chunk and mounts its window', async () => {
    localStorage.setItem('webos.welcomed', 'true');
    history.replaceState(null, '', '/');
    render(<OSProvider><App /></OSProvider>);
    const osNow = () => window.__os; // reassigned on every state change
    for (const id of LAZY_APPS) act(() => { osNow().launch(id); });
    await settle(); // lazy imports + Suspense resolution

    for (const id of LAZY_APPS) {
      expect(osNow().windows.some((w) => w.appId === id), id).toBe(true);
    }
    // every window left Suspense: seven real titlebars, no stuck fallbacks
    const titlebars = [...document.querySelectorAll('.titlebar')];
    expect(titlebars.length).toBeGreaterThanOrEqual(LAZY_APPS.length);

    // spot-check one plugin's real content to prove the chunk executed:
    // TaskManager's honest per-app CPU note renders inside its window
    expect(document.body.textContent).toMatch(/per-app CPU isn.t observable/);
  });

  it('chunk ids stay in lockstep with the registry (every plugin is launchable)', async () => {
    const { APP_COMPONENTS } = await import('../src/apps/components.js');
    const { APP_INDEX } = await import('../src/os/registry.js');
    for (const id of Object.keys(APP_COMPONENTS)) {
      expect(APP_INDEX.some((a) => a.id === id), `registry is missing component key "${id}"`).toBe(true);
    }
  });
});
