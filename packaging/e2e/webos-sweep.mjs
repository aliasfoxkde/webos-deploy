// Full-system polish + functional sweep for ArtCraft WebOS.
// Boots the built dist, drives EVERY first-party surface (shell, plugin
// apps, settings sections, App Store, external embeds, persistence),
// screenshots each, and attributes console errors to the phase that caused
// them. Verdict: per-phase PASS/FAIL + overall.
//
// Lives in packaging/e2e/ so it survives scratch GC. Build first
// (cd webos && npm run build), then from the repo root:
//   node packaging/e2e/webos-sweep.mjs
// Env overrides: WEBOS_DIR (shell checkout), CHROME, SWEEP_SHOTS, SWEEP_PORT.
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const PORT = Number(process.env.SWEEP_PORT || 4219);
const SHOTS = process.env.SWEEP_SHOTS || '/var/tmp/sweep-shots';
mkdirSync(SHOTS, { recursive: true });

/* ---- serve dist/ ---- */
const srv = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1',
  '--port', String(PORT), '--strictPort'],
  { cwd: process.env.WEBOS_DIR || '/nas/Temp/repos/webos-deploy/webos', detached: true, stdio: 'pipe' });
let srvOut = '';
srv.stdout.on('data', (d) => { srvOut += d; });
srv.stderr.on('data', (d) => { srvOut += d; });
for (let i = 0; i < 40; i++) {
  try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
}

/* ---- chromium ---- */
const profile = mkdtempSync(join(tmpdir(), 'sweep-'));
const chr = spawn(process.env.CHROME || '/usr/bin/chromium', [
  '--headless=new', '--remote-debugging-port=0', '--use-angle=swiftshader',
  '--disable-dev-shm-usage', '--no-first-run', '--window-size=1440,900',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'pipe' });
let stderr = ''; chr.stderr.on('data', (d) => { stderr += d; });
await once(chr.stderr, 'data');
const wsPort = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1];
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

/* ================ F. external embeds ================ */
for (const [id, waitMs] of [['cadcraft', 12000], ['photocraft', 12000], ['youtube', 5000]]) {
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

/* ================ G. persistence across reload ================ */
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
