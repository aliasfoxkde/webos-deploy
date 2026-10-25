// Full-system polish + functional sweep for ArtCraft WebOS.
// Boots the built dist, drives EVERY first-party surface (shell, plugin
// apps, settings sections, App Store, external embeds, persistence),
// screenshots each, and attributes console errors to the phase that caused
// them. Verdict: per-phase PASS/FAIL + overall.
//
// One phase goes past the pixels: `state-assertions` reads the shell's
// internal state over CDP — the window registry in the OS reducer and the
// records in the IndexedDB database the shell persists to — so a surface
// that renders the right pixels over the wrong state still fails.
//
// Lives in packaging/e2e/ so it survives scratch GC. Build first
// (cd webos && npm run build), then from the repo root:
//   node packaging/e2e/webos-sweep.mjs
// Env overrides: WEBOS_DIR (shell checkout), CHROME, SWEEP_SHOTS, SWEEP_PORT.
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.SWEEP_PORT || 4219);
const SHOTS = process.env.SWEEP_SHOTS || '/var/tmp/sweep-shots';
mkdirSync(SHOTS, { recursive: true });

/* ---- serve dist/ ---- */
// WEBOS_DIR defaults to the webos/ checkout that ships next to this script,
// so the sweep runs in CI (where the checkout path is unknown) as well as
// locally. Override with WEBOS_DIR=... when pointing at a different tree.
const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const WEBOS_DIR = process.env.WEBOS_DIR || join(REPO_ROOT, 'webos');
if (!existsSync(join(WEBOS_DIR, 'dist', 'index.html'))) {
  console.error(`sweep: no build at ${join(WEBOS_DIR, 'dist', 'index.html')} — run "npm run build" in webos/ first`);
  process.exit(2);
}

const srv = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1',
  '--port', String(PORT), '--strictPort'],
  { cwd: WEBOS_DIR, detached: true, stdio: 'pipe' });
let srvOut = '';
srv.stdout.on('data', (d) => { srvOut += d; });
srv.stderr.on('data', (d) => { srvOut += d; });
for (let i = 0; i < 40; i++) {
  try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
}

/* ---- chromium ---- */
const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((c) => existsSync(c));
if (!CHROME) {
  console.error(`sweep: no browser found — looked at ${CHROME_CANDIDATES.join(', ')}. `
    + 'Set CHROME=/path/to/chromium.');
  process.exit(2);
}
console.log(`sweep: browser ${CHROME}`);
const profile = mkdtempSync(join(tmpdir(), 'sweep-'));
const chr = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', '--use-angle=swiftshader',
  '--disable-dev-shm-usage', '--no-first-run', '--window-size=1440,900',
  // CI containers run as root with no user namespaces; the sandbox cannot be
  // entered there, so disable it explicitly.
  '--no-sandbox', '--disable-gpu',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'pipe' });
// Chromium announces its DevTools endpoint on stderr, but the line does not
// necessarily arrive in the FIRST chunk — on a CI runner the first chunk is
// usually a dbus/GL warning. Keep reading until the endpoint shows up.
let stderr = '';
const wsPort = await new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error(`chromium did not report a DevTools port\n${stderr.slice(-500)}`)),
    // 60s: under concurrent load (coverage runs, CI pipelines) a cold
    // Chromium start has been observed to exceed 30s before announcing
    // the endpoint — the retry-then-pass flake on 2026-10-25.
    60000,
  );
  chr.stderr.on('data', (d) => {
    stderr += d;
    const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
    if (!m) return;
    clearTimeout(timer);
    try { resolve(new URL(m[1]).port); } catch (e) { reject(e); }
  });
});
const targets = await (await fetch(`http://127.0.0.1:${wsPort}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let mid = 0; const pending = new Map(); const errors = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++mid; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.exceptionThrown')
    errors.push({ phase: curPhase, text: m.params?.exceptionDetails?.exception?.description || 'exception' });
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    errors.push({ phase: curPhase, text: (m.params.args || []).map((a) => a.value ?? a.description).join(' ') });
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
};
await send('Page.enable'); await send('Runtime.enable');
// FireCraft bridge capture — inject once before first navigation so all phases can use it
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__fcBridge = [];
  window.addEventListener('message', (e) => {
    if (e.data?.source === 'firecraft') window.__fcBridge.push(e.data);
  });
  window.__sendToFirecraft = (msg) => {
    const f = document.querySelector('.win iframe');
    if (f && f.contentWindow) f.contentWindow.postMessage(msg, '*');
  };
` });

let curPhase = 'boot';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.exception?.description
    || r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval failed');
  return r.result.value;
};
let shotN = 0;
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(SHOTS, `${String(++shotN).padStart(2, '0')}-${name}.png`),
    Buffer.from(r.data, 'base64'));
};
const poll = async (expr, ms = 30000, step = 400) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await evalJs(expr).catch(() => false)) return true;
    await wait(step);
  }
  return false;
};
const settleAnim = () => evalJs(`getAnimations().forEach(a => a.finish()); true`).catch(() => true);
const clickAt = async (x, y, button = 'left') => {
  for (const t of ['mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type: t, x, y, button, clickCount: 1, buttons: button === 'left' ? 1 : 2 });
};
const centerOf = async (sel) => evalJs(`(() => {
  const b = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect();
  return b ? [b.x + b.width / 2, b.y + b.height / 2] : null;
})()`);
const typeText = async (text) => { await send('Input.insertText', { text }); };

/* results */
const results = [];
const phase = async (name, fn) => {
  curPhase = name;
  const before = errors.length;
  try { await fn(); results.push({ phase: name, ok: true, note: '' }); }
  catch (e) { results.push({ phase: name, ok: false, note: String(e.message).slice(0, 300) }); }
  const newErrs = errors.slice(before).filter((e) => e.phase === name);
  if (newErrs.length) results.push({ phase: name, ok: false, note: `${newErrs.length} page errors: ${newErrs[0].text?.slice(0, 160)}` });
};
const skip = (name, why) => results.push({ phase: name, ok: true, note: `SKIPPED — ${why}` });

// The FireCraft phases below drive the DEPLOYED app (firecraft-web.pages.dev),
// so they need the public internet. On a runner without egress they are
// skipped rather than failed — a CI gate must not depend on a third party's
// deploy being up.
let firecraftReachable = false;
try {
  const ctl = AbortSignal.timeout(8000);
  const r = await fetch('https://firecraft-web.pages.dev/', { signal: ctl, redirect: 'follow' });
  firecraftReachable = r.ok || r.status < 500;
} catch { firecraftReachable = false; }
console.log(`firecraft-web.pages.dev reachable: ${firecraftReachable}`);

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await poll(`!!document.querySelector('#start-btn')`, 60000);
await settleAnim();

/* ================ A. boot + welcome ================ */
await phase('boot-welcome', async () => {
  if (!await evalJs(`!!document.querySelector('.wl-enter')`)) throw new Error('welcome landing missing');
  await shot('welcome');
  await evalJs(`document.querySelector('.wl-enter').click()`);
  await wait(1200);
  await settleAnim();
  await shot('desktop');
  if (!await evalJs(`!!document.querySelector('#taskbar')`)) throw new Error('taskbar missing after enter');
  await evalJs(`document.querySelector('.win[aria-label="Welcome"] .tb-btn.close')?.click()`);
  await wait(400);
  if (await evalJs(`document.querySelectorAll('.win').length`) !== 0) throw new Error('welcome window did not close');
});

/* ================ B. shell: start menu, calendar, context menu ================ */
await phase('shell-startmenu', async () => {
  await clickAt(...(await centerOf('#start-btn')));
  await poll(`!!document.querySelector('.start-menu, .sm')`, 5000);
  await shot('start-menu');
  // search-driven launch surface
  await evalJs(`(() => {
    const q = document.querySelector('[aria-label="Search apps and settings"]');
    if (!q) throw new Error('start search input missing');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(q, 'calc');
    q.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await wait(400);
  const hits = await evalJs(`document.querySelectorAll('.sm-results .sm-app, .sm-item').length`);
  if (!hits) throw new Error('start search returned no hits for calc');
  await shot('start-search');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await wait(300);
});
await phase('shell-calendar', async () => {
  const ck = await centerOf('#clock');
  if (!ck) throw new Error('#clock not found');
  await clickAt(...ck);
  await poll(`!!document.querySelector('.calendar, .cal')`, 5000);
  await shot('calendar');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await wait(300);
});
await phase('shell-contextmenu', async () => {
  await clickAt(700, 500, 'right');
  await poll(`!!document.querySelector('.ctx-menu, .context-menu, [role="menu"]')`, 5000);
  await shot('desktop-context-menu');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await wait(300);
});
await phase('shell-window-mgmt', async () => {
  await evalJs(`__os.launch('notepad')`);
  await poll(`!!document.querySelector('.win')`, 5000);
  // maximize
  await evalJs(`(() => { const b=[...document.querySelectorAll('.win .tb-btn')].find(b=>/max|□|▢/.test(b.title+b.className)); b?.click(); return true; })()`);
  await wait(400);
  const maximized = await evalJs(`(() => { const w = document.querySelector('.win'); const r = w.getBoundingClientRect(); return r.width > 1300; })()`);
  await shot('window-maximized');
  // minimize via titlebar button
  await evalJs(`(() => { const b=[...document.querySelectorAll('.win .tb-btn')].find(b=>/min|–/.test(b.title+b.className)); b?.click(); return true; })()`);
  await wait(400);
  const minimized = await evalJs(`(() => { const w = document.querySelector('.win'); return !w || w.getBoundingClientRect().width < 50 || w.style.display === 'none'; })()`);
  await shot('window-minimized');
  await evalJs(`__os.focus ? __os.focus(document.querySelector('.win')?.id || '', true) : true`);
  await wait(300);
  // close via api
  await evalJs(`(() => { const w = document.querySelector('.win'); __os.close(w?.dataset?.id || ''); return true; })()`);
  await wait(400);
  const closed = await evalJs(`document.querySelectorAll('.win').length === 0`);
  if (!closed) throw new Error('window did not close');
  await shot('window-closed');
  results.push({ phase: 'shell-window-mgmt', ok: true, note: `maximized=${maximized} minimized=${minimized}` });
});

/* ================ C. plugin apps ================ */
const PLUGIN_CHECKS = {
  terminal: async () => {
    await poll(`!!document.querySelector('.xterm-host, .terminal')`, 8000);
    await evalJs(`document.querySelector('.xterm-host, .terminal').click()`);
    await wait(400);
    await typeText('echo sweep-alive-42');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await wait(1200);
    const rows = await evalJs(`document.querySelectorAll('.xterm-rows > div').length`);
    const text = await evalJs(`document.querySelector('.xterm-rows')?.textContent || ''`);
    if (!text.includes('sweep-alive-42')) throw new Error(`terminal echo missing (rows=${rows})`);
  },
  calc: async () => {
    await poll(`!!document.querySelector('.calc')`, 8000);
    for (const k of ['7', '×', '6', '='])
      await evalJs(`[...document.querySelectorAll('.calc .key')].find(b => b.textContent.trim() === ${JSON.stringify(k)})?.click()`);
    await wait(300);
    const disp = await evalJs(`(document.querySelector('.calc-entry')?.value ?? document.querySelector('.calc-display')?.textContent) || ''`);
    if (!disp.includes('42')) throw new Error(`calc result wrong: "${disp.slice(0, 60)}"`);
  },
  notepad: async () => {
    await poll(`!!document.querySelector('.win textarea, .np-area, .notepad textarea')`, 8000);
    await evalJs(`(() => {
      const t = document.querySelector('.win textarea');
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      set.call(t, 'sweep note 12345');
      t.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await wait(1600); // autosave
    const saved = await evalJs(`JSON.stringify(localStorage).includes('sweep note 12345')`);
    if (!saved) throw new Error('notepad autosave missing from localStorage');
  },
  editor: async () => {
    if (!await poll(`!!document.querySelector('.cm-content')`, 10000)) throw new Error('CodeMirror never mounted');
    await evalJs(`document.querySelector('.cm-content').focus()`);
    await wait(200);
    await typeText('// sweep edit');
    await wait(600);
    const has = await evalJs(`document.querySelector('.cm-editor')?.textContent?.includes('sweep edit')`);
    if (!has) throw new Error('editor did not accept typing');
  },
  files: async () => {
    await poll(`!!document.querySelector('.f-grid')`, 8000);
    const n0 = await evalJs(`document.querySelectorAll('.f-grid .f-tile').length`);
    await evalJs(`[...document.querySelectorAll('.f-btn')].find(b => b.textContent === 'New folder')?.click()`);
    await wait(300);
    await evalJs(`(() => {
      const i = document.querySelector('[aria-label="New folder name"]');
      if (!i) throw new Error('create-folder input missing');
      i.focus();
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(i, 'sweep-dir');
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.blur(); // commits on blur
      return true;
    })()`);
    await wait(500);
    const dirs = await evalJs(`document.querySelectorAll('.f-grid .f-tile').length`);
    if (dirs <= n0) throw new Error(`folder count did not grow (${n0} -> ${dirs})`);
  },
  browser: async () => {
    await poll(`!!document.querySelector('[aria-label="Address and search bar"]')`, 8000);
    await evalJs(`(() => {
      const a = document.querySelector('[aria-label="Address and search bar"]');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(a, 'example.com');
      a.dispatchEvent(new Event('input', { bubbles: true }));
      a.focus();
      a.closest('form').requestSubmit();
      return true;
    })()`);
    await wait(6000); // remote load
    const tab = await evalJs(`document.querySelector('.bw-strip')?.textContent || ''`);
    if (!/example/i.test(tab)) throw new Error(`browser tab did not navigate: "${tab.slice(0, 60)}"`);
  },
  taskmgr: async () => {
    await wait(800);
    const text = await evalJs(`[...document.querySelectorAll('.win')].find(w => w.getAttribute('aria-label') === 'Task Manager')?.textContent || ''`);
    if (!/Processes|Performance|Startup & storage/i.test(text)) throw new Error(`taskmgr shows no tabs: "${text.slice(0, 120)}"`);
  },
  photos: async () => { await poll(`!!document.querySelector('.win img, .ph-grid, .photos')`, 8000); },
  video: async () => { await poll(`!!document.querySelector('.win video, .video, .vp')`, 8000); },
  weather: async () => {
    await wait(2500); // forecast fetch
    const t = await evalJs(`document.querySelector('.win')?.textContent?.slice(0, 300) || ''`);
    if (!t.trim()) throw new Error('weather window empty');
  },
  chat: async () => {
    await wait(1200);
    const t = await evalJs(`document.querySelector('.win')?.textContent?.slice(0, 300) || ''`);
    if (!t.trim()) throw new Error('chat window empty');
  },
};
const PLUGIN_ORDER = ['terminal', 'calc', 'notepad', 'editor', 'files', 'browser', 'taskmgr', 'photos', 'video', 'weather', 'chat'];
for (const appId of PLUGIN_ORDER) {
  await phase(`app-${appId}`, async () => {
    const opened = await evalJs(`(() => { __os.launch(${JSON.stringify(appId)}); return true; })()`);
    if (!opened) throw new Error('launch dispatch failed');
    await poll(`document.querySelectorAll('.win').length >= 1 && [...document.querySelectorAll('.win')].some(w => (${JSON.stringify(appId)}).length && w.getBoundingClientRect().width > 100)`, 12000);
    await wait(700);
    await settleAnim();
    await shot(`app-${appId}`);
    const check = PLUGIN_CHECKS[appId];
    if (check) await check();
    // close every window this app opened
    await evalJs(`(() => { [...document.querySelectorAll('.win')].forEach(w => __os.close(w.dataset.id)); return true; })()`);
    await wait(400);
  });
}

/* ================ D. settings: all 10 sections ================ */
await phase('settings-sections', async () => {
  await evalJs(`__os.launch('settings')`);
  await poll(`!!document.querySelector('.set-rail')`, 8000);
  const sections = await evalJs(`[...document.querySelectorAll('.set-rail button, .set-rail a')].map(b => b.textContent.trim())`);
  for (const label of sections) {
    await evalJs(`[...document.querySelectorAll('.set-rail button, .set-rail a')].find(b => b.textContent.trim() === ${JSON.stringify(label)})?.click()`);
    await wait(500);
    await shot(`settings-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`);
  }
  const n = sections.length;
  if (n < 10) throw new Error(`expected >=10 settings sections, found ${n}: ${sections.join(', ')}`);
});
await phase('settings-appearance-live', async () => {
  await evalJs(`[...document.querySelectorAll('.set-rail button')].find(b => b.textContent.includes('Appearance'))?.click()`);
  await wait(500);
  const before = await evalJs(`document.body.style.background`);
  const clicked = await evalJs(`(() => {
    const h3 = [...document.querySelectorAll('h3')].find(x => x.textContent.trim() === 'Theme');
    const row = h3?.nextElementSibling;
    const btn = row?.querySelector('button.preset:not(.on)');
    if (!btn) return false;
    btn.click();
    return btn.textContent.trim();
  })()`);
  if (!clicked) throw new Error('no inactive builtin theme preset found');
  await wait(600);
  const after = await evalJs(`document.body.style.background`);
  if (before === after) throw new Error(`theme preset switch (${clicked}) did not change body background`);
  await shot('theme-switched');
});

/* ================ E. App Store: install + uninstall ================ */
await phase('store-install', async () => {
  await evalJs(`__os.launch('store')`);
  await poll(`!!document.querySelector('.win')`, 6000);
  await wait(800);
  await shot('store');
  // install Globe (first store app)
  await evalJs(`__os.install('globe')`);
  await wait(700); // re-render assigns the fresh api to window.__os
  const installed = await evalJs(`__os.apps.some(a => a.id === 'globe')`);
  const onDesktop = await evalJs(`[...document.querySelectorAll('#icon-grid .desk-icon')].some(i => /globe/i.test(i.textContent || i.title || ''))`);
  await shot('store-installed-globe');
  if (!installed) throw new Error('install(globe) did not land in apps');
  // uninstall to prove the reverse path
  await evalJs(`__os.uninstall('globe')`);
  await wait(400);
  const gone = await evalJs(`!__os.apps.some(a => a.id === 'globe')`);
  if (!gone) throw new Error('uninstall(globe) failed');
  await evalJs(`(() => { [...document.querySelectorAll('.win')].forEach(w => __os.close(w.dataset.id)); return true; })()`);
});

/* ================ F. external embeds + FireCraft bridge ================ */
for (const [id, waitMs] of [['cadcraft', 12000], ['photocraft', 12000], ['firecraft', 15000], ['youtube', 5000]]) {
  await phase(`embed-${id}`, async () => {
    await evalJs(`__os.launch(${JSON.stringify(id)})`);
    await poll(`document.querySelectorAll('.win').length >= 1`, 8000);
    await wait(waitMs);
    await shot(`embed-${id}`);
    const state = await evalJs(`(() => {
      const w = [...document.querySelectorAll('.win')].pop();
      const f = w?.querySelector('iframe');
      const panel = w?.textContent || '';
      return {
        iframe: !!f,
        // cross-origin iframes report about:blank until loaded; loaded check is best-effort
        src: f?.src || '',
        launchPanel: /open|launch|tab|forbid/i.test(panel),
        text: panel.slice(0, 120),
      };
    })()`);
    await evalJs(`(() => { [...document.querySelectorAll('.win')].forEach(w => __os.close(w.dataset.id)); return true; })()`);
    await wait(400);
    if (!state.iframe && !state.launchPanel) throw new Error(`no iframe or launch panel for ${id}: ${state.text}`);
  });
}

/* FireCraft: icon launch → bridge ready → iframe verified → open-with → exportPng → Photos */
if (!firecraftReachable) skip('firecraft-launch-ready', 'firecraft-web.pages.dev unreachable');
else await phase('firecraft-launch-ready', async () => {
  await evalJs(`(() => {
    const icons = [...document.querySelectorAll('.desk-icon')];
    const fc = icons.find((n) => (n.textContent || '').includes('FireCraft'));
    if (!fc) throw new Error('FireCraft icon missing from desktop');
    fc.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`);
  await poll(`document.querySelectorAll('.win iframe').length >= 1`, 8000);
  await wait(2000); // wasm boot
  // Wait for bridge ready signal (up to 20 s for wasm init)
  let fired = false;
  for (let i = 0; i < 40; i++) {
    const msgs = await evalJs('window.__fcBridge || []').catch(() => []);
    if (msgs.some((m) => m.type === 'ready')) { fired = true; break; }
    await wait(500);
  }
  if (!fired) throw new Error('FireCraft bridge ready signal never arrived');
  // Verify iframe src
  const src = await evalJs(`document.querySelector('.win iframe')?.src || ''`);
  if (!src.includes('firecraft-web.pages.dev')) throw new Error(`unexpected iframe src: ${src}`);
  await shot('firecraft-ready');
  await evalJs(`(() => { [...document.querySelectorAll('.win')].forEach(w => __os.close(w.dataset.id)); return true; })()`);
  await wait(400);
});

/* FireCraft open-with: launch with a path argument and verify the bridge responds */
if (!firecraftReachable) skip('firecraft-open-with', 'firecraft-web.pages.dev unreachable');
else await phase('firecraft-open-with', async () => {
  // Seed the VFS with a minimal PNG at the path the Files app would
  // reference. The record is written straight into the 'files' object store
  // of the 'webos' IndexedDB (see src/os/db.js) — importing the module by
  // URL is not possible here because the production build bundles it.
  await evalJs(`(async () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/png' });
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('webos', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'path' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise((res, rej) => {
      const t = db.transaction('files', 'readwrite');
      t.objectStore('files').put({ path: '/Apps/firecraft/sweep-test.fw.png', blob, type: 'image/png', size: blob.size, mtime: Date.now() });
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
    return true;
  })()`);
  await evalJs(`__os.launch('firecraft', { path: '/Apps/firecraft/sweep-test.fw.png' })`);
  await poll(`document.querySelectorAll('.win iframe').length >= 1`, 8000);
  await wait(3000); // wasm boot + document open
  const fired = await evalJs(`window.__fcBridge || []`).catch(() => []);
  // Either 'ready' (document opened and app ready) or 'applied' (document opened + an operation applied)
  const opened = fired.some((m) => m.type === 'ready' || m.type === 'applied');
  await shot('firecraft-open-with');
  await evalJs(`(() => { [...document.querySelectorAll('.win')].forEach(w => __os.close(w.dataset.id)); return true; })()`);
  if (!opened) throw new Error('FireCraft did not respond to open-with path argument');
});

/* ================ G. internal state (not just pixels) ================ */
// The phases above prove that surfaces RENDER. This one asserts the state
// behind them: the window registry in the OS reducer, and the records in
// the IndexedDB database the shell persists to (src/os/db.js).
await phase('state-assertions', async () => {
  // start from a clean desktop
  await evalJs(`(() => { [...document.querySelectorAll('.win')].forEach(w => __os.close(w.dataset.id)); return true; })()`);
  await wait(400);

  // two launches register in the reducer AND in the DOM
  await evalJs(`__os.launch('notepad')`);
  await evalJs(`__os.launch('calc')`);
  if (!await poll(`__os.windows.length === 2`, 8000)) throw new Error('state: two launches did not register two windows');
  const apps = await evalJs(`__os.windows.map(w => w.appId).sort().join(',')`);
  if (apps !== 'calc,notepad') throw new Error(`state: unexpected window apps "${apps}"`);
  const dom = await evalJs(`document.querySelectorAll('.win').length`);
  if (dom !== 2) throw new Error(`state: ${dom} windows in the DOM, 2 in the reducer`);
  const recents = await evalJs(`(__os.recents || []).join(',')`);
  if (!recents.includes('notepad') || !recents.includes('calc')) throw new Error(`state: recents missing a launched app: "${recents}"`);

  // a single-instance app focuses the running window instead of opening a second
  await evalJs(`__os.launch('settings')`);
  await wait(600);
  const one = await evalJs(`__os.windows.length`);
  await evalJs(`__os.launch('settings')`);
  await wait(600);
  const two = await evalJs(`__os.windows.length`);
  if (one !== two) throw new Error(`state: settings opened ${two - one} extra window(s) — single-instance violated`);

  // the persisted database carries its stores, and a record round-trips
  const idb = await evalJs(`(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('webos', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'path' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const put = (store, value, key) => new Promise((res, rej) => {
      const req = key ? db.transaction(store, 'readwrite').objectStore(store).put(value, key)
        : db.transaction(store, 'readwrite').objectStore(store).put(value);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
    const get = (store, key) => new Promise((res, rej) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    await put('kv', { probe: 'state-assertions' }, 'sweep-probe');
    const kv = await get('kv', 'sweep-probe');
    await put('files', { path: '/sweep/state-probe.txt', type: 'text/plain', size: 21, mtime: 1 }, null);
    const file = await get('files', '/sweep/state-probe.txt');
    const stores = [...db.objectStoreNames].sort().join(',');
    db.close();
    return { stores, kvProbe: kv && kv.probe, filePath: file && file.path, fileSize: file && file.size };
  })()`);
  if (!idb.stores.includes('kv') || !idb.stores.includes('files')) throw new Error(`state: IndexedDB stores are "${idb.stores}"`);
  if (idb.kvProbe !== 'state-assertions') throw new Error(`state: kv record read back as ${JSON.stringify(idb.kvProbe)}`);
  if (idb.filePath !== '/sweep/state-probe.txt' || idb.fileSize !== 21) throw new Error(`state: files record read back as ${JSON.stringify(idb)}`);
  await shot('state-assertions');
});

/* ================ H. surfaces the legacy driver covered ================ */
// webos/scripts/screenshot-drive.mjs drove these by hand. They are automated
// here so the coverage does not depend on a person remembering to run it.
await phase('mobile-layout', async () => {
  await evalJs(`(() => { [...document.querySelectorAll('.win')].forEach(w => __os.close(w.dataset.id)); return true; })()`);
  await evalJs(`__os.setUiMode('mobile')`);
  await wait(700);
  if (!await evalJs(`!!document.querySelector('#home-fab')`)) throw new Error('mobile: no FAB in the dock');
  await shot('mobile-fab');
  await evalJs(`document.querySelector('#home-fab').click()`);
  await wait(500);
  const apps = await evalJs(`document.querySelectorAll('.drawer-app').length`);
  if (!apps) throw new Error('mobile: the drawer lists no apps');
  await shot('mobile-drawer');
  await evalJs(`[...document.querySelectorAll('.drawer-app')].find(b => b.textContent.includes('Terminal'))?.click()`);
  await wait(900);
  const wins = await evalJs(`__os.windows.length`);
  if (!wins) throw new Error('mobile: launching from the drawer opened no window');
  await shot('mobile-app');
  await evalJs(`(() => { [...document.querySelectorAll('.win')].forEach(w => __os.close(w.dataset.id)); return true; })()`);
  await evalJs(`__os.setUiMode('auto')`);
  await wait(500);
});

await phase('window-tiling', async () => {
  await evalJs(`(() => { [...document.querySelectorAll('.win')].forEach(w => __os.close(w.dataset.id)); return true; })()`);
  await evalJs(`__os.launch('notepad')`);
  await wait(700);
  const vw = await evalJs(`window.innerWidth`);
  const key = (k) => evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, metaKey: true, bubbles: true }))`);
  await key('ArrowLeft');
  await wait(500);
  const left = await evalJs(`(() => { const w = __os.windows[0]; return { x: w.rect.x, w: w.rect.w, snap: w.snap }; })()`);
  if (left.x !== 0) throw new Error(`tiling: Meta+Left left x=${left.x}, want 0`);
  if (Math.abs(left.w - vw / 2) > 60) throw new Error(`tiling: Meta+Left width ${left.w}, want about ${Math.round(vw / 2)}`);
  await shot('tiled-left');
  await key('ArrowUp');
  await wait(400);
  const up = await evalJs(`(() => { const w = __os.windows[0]; return { max: w.max, snap: w.snap }; })()`);
  if (!up.max) throw new Error('tiling: Meta+Up did not maximize');
  await key('ArrowDown');
  await wait(400);
  const down = await evalJs(`(() => { const w = __os.windows[0]; return { max: w.max }; })()`);
  if (down.max) throw new Error('tiling: Meta+Down did not unmaximize');
  await evalJs(`(() => { [...document.querySelectorAll('.win')].forEach(w => __os.close(w.dataset.id)); return true; })()`);
});

await phase('taskbar-groups', async () => {
  await evalJs(`(() => { (__os.groups || []).forEach(g => __os.removeGroup(g.id)); return true; })()`);
  await wait(400);
  await clickAt(700, 520, 'right');
  await poll(`!!document.querySelector('.ctx-item')`, 6000);
  await evalJs(`[...document.querySelectorAll('.ctx-item')].find(b => b.textContent.includes('New group'))?.click()`);
  await wait(600);
  const groups = await evalJs(`(__os.groups || []).length`);
  if (!groups) throw new Error('groups: the context menu did not create one');
  if (!await evalJs(`!!document.querySelector('.group-tile')`)) throw new Error('groups: no tile on the desktop');
  const appId = await evalJs(`__os.apps[0].id`);
  await evalJs(`__os.groupAdd(__os.groups[0].id, ${JSON.stringify(appId)})`);
  await wait(500);
  const members = await evalJs(`(__os.groups[0].appIds || []).length`);
  if (members !== 1) throw new Error(`groups: ${members} members, want 1`);
  await evalJs(`document.querySelector('.group-tile')?.click()`);
  await wait(500);
  const rows = await evalJs(`document.querySelectorAll('.gp-app').length`);
  if (rows !== 1) throw new Error(`groups: the popup lists ${rows} members, want 1`);
  await shot('group-popup');
  await evalJs(`__os.removeGroup(__os.groups[0].id)`);
  await wait(500);
  if (await evalJs(`(__os.groups || []).length`)) throw new Error('groups: the group survived removal');
});

/* ================ I. persistence across reload ================ */
await phase('persistence', async () => {
  await evalJs(`__os.setTheme({ accent: '#ff5a5a' })`);
  await wait(500);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await poll(`!!document.querySelector('#start-btn')`, 60000);
  await wait(800);
  const accent = await evalJs(`getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`);
  if (!/255,\s*90,\s*90|rgb\(255, 90, 90\)|#ff5a5a/i.test(accent)) throw new Error(`accent did not persist: "${accent}"`);
  const composites = await evalJs(`localStorage.getItem('webos.composites')`);
  await shot('after-reload');
});

/* ================ verdict ================ */
const fails = results.filter((r) => !r.ok);
console.log('\n=== SWEEP RESULTS ===');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.phase}${r.note ? '  — ' + r.note : ''}`);
console.log(`\npage errors: ${errors.length}`);
errors.slice(0, 12).forEach((e) => console.log(`  [${e.phase}] ${String(e.text).slice(0, 200)}`));
console.log(`\nSWEEP: ${fails.length === 0 && errors.length === 0 ? 'PASS' : 'FAIL'} (${results.filter(r=>r.ok).length}/${results.length} phases green, ${errors.length} errors)`);
console.log('screenshots:', shotN, '→', SHOTS);

ws.close(); chr.kill();
try { process.kill(-srv.pid, 'SIGKILL'); } catch {}
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch {}
process.exit(fails.length === 0 && errors.length === 0 ? 0 : 1);
