// Dev tool: CDP-driven screenshot session against a running WebOS preview
// server (`npm run preview`), for visual verification without a browser.
// Usage: node scripts/screenshot-drive.mjs [base-url] [out-dir]
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const BASE = process.argv[2] || 'http://localhost:5180/';
const OUT = process.argv[3] || '/var/tmp/webos-shots';
mkdirSync(OUT, { recursive: true });

// Watchdog: a dead chromium leaves pending CDP promises unsettled forever —
// bail out loudly instead of hanging.
const watchdog = setTimeout(() => { console.error('WATCHDOG: driver did not finish in 8min'); process.exit(3); }, 8 * 60 * 1000);
watchdog.unref?.();

// Private profile + ephemeral CDP port per run. Debian's /usr/bin/chromium is
// a wrapper that falls back to a SHARED profile dir, and a leaked browser from
// an earlier run can squat a fixed --remote-debugging-port — a later run then
// silently drives the stale browser (its profile, its IndexedDB). Port 0 plus
// the "DevTools listening" stderr banner makes that impossible.
const profile = mkdtempSync(`${tmpdir()}/webos-prof-`);
const chrome = spawn('/usr/bin/chromium', [
  '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1520,900', 'about:blank',
], { detached: true }); // own process group, so killTree reaps renderers too
let cdpBanner = '';
chrome.stderr.on('data', (d) => { cdpBanner += d; });
const killTree = () => {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { try { chrome.kill('SIGKILL'); } catch { /* gone */ } }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
};
process.on('exit', killTree);

// The banner carries the true endpoint — never guess a port.
let webSocketDebuggerUrl = null;
for (let i = 0; i < 60 && !webSocketDebuggerUrl; i++) {
  await sleep(500);
  webSocketDebuggerUrl = cdpBanner.match(/DevTools listening on (ws:\/\/\S+)/)?.[1] || null;
}
if (!webSocketDebuggerUrl) { killTree(); throw new Error('chromium CDP endpoint never came up'); }
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
const pageErrors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') {
    pageErrors.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 400));
  }
};
function send(method, params = {}, sessionId) {
  const id = ++seq;
  return new Promise((res, rej) => {
    pending.set(id, (msg) => (msg.error ? rej(new Error(`${method}: ${msg.error.message}`)) : res(msg.result)));
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

// NOTE: create the tab on about:blank and navigate via Page.navigate — a
// target created directly with the page URL paints blank under headless
// chromium (DOM renders, surface never composites).
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await sleep(250); // flattened session must finish registering before domain commands
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1520, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: BASE }, sessionId);
await sleep(3500);

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('shot', name);
}
const evaluate = (expression) => send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
// async page code via stash-and-poll (Runtime.evaluate has no awaitPromise)
const evalAsync = async (body, tries = 25) => {
  await evaluate(`window.__a = null; (async () => { ${body} })().then((v) => { window.__a = { ok: true, v }; }).catch((e) => { window.__a = { ok: false, e: String((e && e.message) || e) }; })`);
  for (let i = 0; i < tries; i++) {
    await sleep(300);
    const r = await evaluate(`window.__a`);
    if (r.result?.value) return r.result.value;
  }
  return { ok: false, e: 'timeout' };
};
// real input fires pointerdown → pointerup → click; dispatch all three
const clickAt = (x, y) => evaluate(`(() => {
  const el = document.elementFromPoint(${x}, ${y});
  if (!el) return;
  const opts = { bubbles: true, cancelable: true, pointerId: 9, clientX: ${x}, clientY: ${y} };
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
})()`);
// real right-click: pointerdown then contextmenu
const ctxAt = (x, y) => evaluate(`(() => {
  const el = document.elementFromPoint(${x}, ${y});
  if (!el) return;
  const opts = { bubbles: true, cancelable: true, pointerId: 8, clientX: ${x}, clientY: ${y}, button: 2 };
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('contextmenu', opts));
})()`);
// Real pointer move — synthetic pointerover events don't drive the OS's
// focus-follows-mouse path (isTrusted-gated in practice); CDP input does.
const moveTo = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
  await sleep(300);
};
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
// poll until an expression turns truthy (bounded)
async function waitFor(expression, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const r = await evaluate(expression);
    if (r.result?.value) return true;
    await sleep(400);
  }
  return false;
}

// Independent-DB canary: if these flip to TIMEOUT, IndexedDB itself is
// wedged in this chromium session (not a webos bug — a session/environment
// state); if 'canary' works while webos DB ops hang, the 'webos' DB is stuck.
const idbCanary = async (label) => console.log('idb canary', label + ':', JSON.stringify(await evalAsync(`
  await new Promise((res, rej) => {
    const o = indexedDB.open('canary', 1);
    o.onupgradeneeded = () => { if (!o.result.objectStoreNames.contains('kv')) o.result.createObjectStore('kv'); };
    o.onsuccess = () => { const db = o.result; const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put('x', 'k'); t.oncomplete = () => { db.close(); res('ok'); }; t.onerror = () => res('tx-err ' + ((t.error && t.error.message) || '?')); };
    o.onerror = () => rej(o.error);
  });
  return 'done';
`, 10)));

// 0. clean slate: unregister the service worker, drop its caches, clear all
// webos.* settings and the IndexedDB disk — runs are reproducible and never
// race a stale SW cache from a previous build.
console.log('clean slate:', JSON.stringify(await evalAsync(`
  const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
  regs.forEach((r) => r.unregister());
  if (window.caches) { for (const n of await caches.keys()) await caches.delete(n); }
  Object.keys(localStorage).filter((k) => k.startsWith('webos.')).forEach((k) => localStorage.removeItem(k));
  await new Promise((res) => { const r = indexedDB.deleteDatabase('webos'); r.onsuccess = res; r.onerror = res; r.onblocked = res; });
  return 'clean';
}`)));
await evaluate(`location.reload()`);
await sleep(2500);
await idbCanary('boot');

// 0b. first-run welcome + persona switching (clean slate ⇒ the overlay is up)
await waitFor(`!!document.querySelector('.welcome')`);
await shot('01b-welcome');
console.log('welcome default persona (want win):', (await evaluate(`document.body.dataset.persona`)).result?.value);
await evaluate(`[...document.querySelectorAll('.wl-p')].find(b => b.textContent.includes('GNOME'))?.click()`);
await sleep(350);
console.log('linux persona (want linux/top/#34d399):', JSON.stringify((await evaluate(
  `({ p: document.body.dataset.persona, tb: document.body.dataset.tb, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() })`
)).result?.value));
await shot('01c-welcome-linux');
await evaluate(`[...document.querySelectorAll('.wl-p')].find(b => b.textContent.includes('Terminal'))?.click()`);
await sleep(350);
console.log('tui persona (want tui/mono true/0px):', JSON.stringify((await evaluate(
  `({ p: document.body.dataset.persona, mono: getComputedStyle(document.body).fontFamily.includes('mono'), radius: getComputedStyle(document.body).getPropertyValue('--radius').trim() })`
)).result?.value));
await shot('01d-welcome-tui');
await evaluate(`document.querySelector('.wl-enter')?.click()`);
await sleep(350);
console.log('welcome entered (want gone+true):', JSON.stringify((await evaluate(
  `({ gone: !document.querySelector('.welcome'), flag: localStorage.getItem('webos.welcomed') })`
)).result?.value));

// 1. desktop home (defaults only — no store apps preinstalled)
await shot('01-home');

// 2. calculator via deep link, each mode
await evaluate(`location.href = '${BASE}?open=calc'`);
await sleep(1800);
await shot('02-calc-standard');
await evaluate(`[...document.querySelectorAll('.calc-tab')].find(b => b.textContent === 'Scientific')?.click()`);
await sleep(300);
await shot('03-calc-scientific');
await evaluate(`[...document.querySelectorAll('.calc-tab')].find(b => b.textContent === 'Graphing')?.click()`);
await sleep(400);
await shot('04-calc-graph');
await evaluate(`[...document.querySelectorAll('.calc-tab')].find(b => b.textContent === 'Programmer')?.click()`);
await sleep(300);
await shot('05-calc-programmer');
await evaluate(`[...document.querySelectorAll('.calc-tab')].find(b => b.textContent === 'Converter')?.click()`);
await sleep(300);
await shot('06-calc-converter');

// expression sanity through the real UI
await evaluate(`[...document.querySelectorAll('.calc-tab')].find(b => b.textContent === 'Standard')?.click()`);
await sleep(200);
await evaluate(`const i = document.querySelector('.calc-entry'); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(i, '5*(3+2)+sqrt(16)'); i.dispatchEvent(new Event('input', { bubbles: true }));`);
await sleep(200);
await shot('07-calc-preview');
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))`);
await sleep(250);
await shot('08-calc-equals');

// 3. weather app (keyless Open-Meteo; network may be blocked — UI must show the error path)
await evaluate(`location.href = '${BASE}?open=weather'`);
await sleep(2000);
await shot('09-weather');

// 4. calendar popup + close-anywhere (portal fix)
await evaluate(`location.href = '${BASE}'`);
await sleep(1500);
await evaluate(`document.querySelector('#clock')?.click()`);
await sleep(400);
await shot('10-calendar');
// click a WINDOW-layer point (desktop) — the old backdrop never saw these
await clickAt(400, 300);
await sleep(250);
await evaluate(`window.__calStillOpen = !!document.querySelector('.cal-pop')`);
const cal = await evaluate(`!!document.querySelector('.cal-pop')`);
console.log('calendar open after desktop click (want false):', cal.result?.value);
await shot('11-calendar-closed');

// 5. context menus (desktop + icon → Properties)
await ctxAt(700, 300);
await sleep(300);
await shot('12-ctx-desktop');
await evaluate(`document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));`);
await sleep(150);
await ctxAt(60, 60); // first desktop icon
await sleep(300);
await shot('13-ctx-icon');
await evaluate(`[...document.querySelectorAll('.ctx-item')].find(b => b.textContent.includes('Properties'))?.click()`);
await sleep(350);
await shot('14-properties');
await evaluate(`document.querySelector('.props .tb-btn.close')?.click()`);
await sleep(200);

// 6. tray: volume + network popups
await evaluate(`document.querySelector('[data-tray="vol"]')?.click()`);
await sleep(300);
await shot('15-tray-volume');
await evaluate(`document.querySelector('.vol-pop input') && (() => { const i = document.querySelector('.vol-pop input'); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(i, '35'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(250);
await shot('16-tray-volume-35');
await clickAt(400, 300); // close on outside click
await evaluate(`document.querySelector('[data-tray="net"]')?.click()`);
await sleep(300);
await shot('17-tray-network');
await clickAt(400, 300);
await sleep(150);

// 7. widget sidebar
await evaluate(`document.querySelector('[data-tray="widgets"]')?.click()`);
await sleep(400);
await shot('18-sidebar');

// 8. store: grid with ratings + detail view
await evaluate(`window.__os?.launch('store')`);
await sleep(500);
await shot('19-store');
await evaluate(`document.querySelector('.store-icon')?.click()`);
await sleep(350);
await shot('20-store-detail');
// install one store app from the detail page
await evaluate(`[...document.querySelectorAll('.btn')].find(b => b.textContent === 'Install')?.click()`);
await sleep(300);
await evaluate(`document.querySelector('.store-detail .back')?.click()`);
await sleep(300);
await shot('21-store-installed');

// 9. settings: full control center (rail + a few panels)
await evaluate(`window.__os?.launch('settings')`);
await sleep(500);
await shot('22-settings-appearance');
await evaluate(`[...document.querySelectorAll('.set-nav')].find(b => b.textContent.includes('Wallpaper') || b.textContent.includes('Appearance'))?.click()`);
await sleep(200);
await evaluate(`[...document.querySelectorAll('.preset')].find(b => b.textContent.includes('Ridgeline'))?.click()`);
await sleep(300);
await shot('23-wallpaper-ridgeline');
await evaluate(`[...document.querySelectorAll('.set-nav')].find(b => b.textContent.includes('Taskbar'))?.click()`);
await sleep(200);
await evaluate(`[...document.querySelectorAll('.chip')].find(b => b.textContent === 'Top')?.click()`);
await sleep(400);
await shot('24-taskbar-top');
await evaluate(`[...document.querySelectorAll('.set-nav')].find(b => b.textContent.includes('Widgets'))?.click()`);
await sleep(200);
await shot('25-settings-widgets');
await evaluate(`[...document.querySelectorAll('.set-nav')].find(b => b.textContent.includes('Storage'))?.click()`);
await sleep(250);
await shot('26-settings-storage');

// 10. desktop drag reorder (synthetic pointer sequence)
await evaluate(`(() => { const tb = [...document.querySelectorAll('.chip')].find(b => b.textContent === 'Bottom'); tb?.click(); return 'ok'; })()`);
await sleep(300);
await evaluate(`window.__before = [...document.querySelectorAll('.desk-icon .lbl')].map(n => n.textContent).join(',');`);
const dragSeq = `
(async () => {
  const icons = [...document.querySelectorAll('.desk-icon')];
  const src = icons[0];
  const r = src.getBoundingClientRect();
  const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
  const dst = icons[3].getBoundingClientRect();
  const dx = dst.left + dst.width / 2, dy = dst.top + dst.height / 2;
  src.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: sx, clientY: sy, button: 0 }));
  await new Promise(r2 => setTimeout(r2, 60));
  for (let i = 1; i <= 6; i++) {
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: sx + (dx - sx) * i / 6, clientY: sy + (dy - sy) * i / 6 }));
    await new Promise(r2 => setTimeout(r2, 60));
  }
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: dx, clientY: dy }));
})()`;
await evaluate(dragSeq);
await sleep(500);
await evaluate(`window.__after = [...document.querySelectorAll('.desk-icon .lbl')].map(n => n.textContent).join(',')`);
const orderCheck = await evaluate(`({ before: window.__before, after: window.__after, changed: window.__before !== window.__after })`);
console.log('drag reorder:', JSON.stringify(orderCheck.result?.value));
await shot('27-after-drag');

// 11. terminal + titlebar context menu with Properties
await evaluate(`window.__os?.launch('terminal')`);
await sleep(400);
await shot('28-terminal');
await evaluate(`document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));`);
await sleep(150);
await evaluate(`document.querySelector('.win').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 500, clientY: 140, cancelable: true }))`);
await sleep(250);
await shot('29-ctx-titlebar');

// 12. mobile mode: drawer + sheets
await evaluate(`window.__os?.setUiMode('mobile')`);
await sleep(500);
await shot('30-mobile-fab');
await evaluate(`document.querySelector('#home-fab')?.click()`);
await sleep(350);
await shot('31-mobile-drawer');
await evaluate(`[...document.querySelectorAll('.drawer-app')].find(b => b.textContent.includes('Terminal'))?.click()`);
await sleep(500);
await shot('32-mobile-app');
await evaluate(`window.__os?.setUiMode('auto')`);
await sleep(300);

await idbCanary('mid (after mobile step)');

// 13. virtual windows are movable (Settings + App Store were pinned before 2.2)
await evaluate(`window.__os?.windows.forEach(w => window.__os.close(w.id)); window.__os?.launch('settings'); window.__os?.launch('store');`);
await sleep(600);
const settingsBefore = await evaluate(`window.__os.windows.find(w => w.appId === 'settings').rect`);
// drag the Settings titlebar by (+320, +160)
const moveWin = `
(async () => {
  const bar = document.querySelector('.win[aria-label="Settings"] .titlebar');
  const r = bar.getBoundingClientRect();
  const sx = r.left + r.width / 2, sy = r.top + 14;
  bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5, clientX: sx, clientY: sy, button: 0 }));
  await new Promise(r2 => setTimeout(r2, 60));
  for (let i = 1; i <= 5; i++) {
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 5, clientX: sx + 64 * i, clientY: sy + 32 * i }));
    await new Promise(r2 => setTimeout(r2, 50));
  }
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5, clientX: sx + 320, clientY: sy + 160 }));
})()`;
await evaluate(moveWin);
await sleep(400);
const settingsAfter = await evaluate(`window.__os.windows.find(w => w.appId === 'settings').rect`);
console.log('settings moved:', JSON.stringify({ before: settingsBefore.result?.value, after: settingsAfter.result?.value,
  moved: settingsBefore.result?.value.x !== settingsAfter.result?.value.x }));
await shot('33-settings-moved');
// same gesture on the App Store window
const storeBefore = await evaluate(`window.__os.windows.find(w => w.appId === 'store').rect`);
const moveStore = moveWin.replace('.win[aria-label="Settings"]', '.win[aria-label="App Store"]');
await evaluate(moveStore);
await sleep(400);
const storeAfter = await evaluate(`window.__os.windows.find(w => w.appId === 'store').rect`);
console.log('store moved:', storeBefore.result?.value.x !== storeAfter.result?.value.x);
await shot('34-store-moved');

// 14. multi-instance: two terminals
await evaluate(`window.__os?.launch('terminal'); window.__os?.launch('terminal');`);
await sleep(500);
const terms = await evaluate(`window.__os.windows.filter(w => w.appId === 'terminal').length`);
console.log('terminal windows (want 2):', terms.result?.value);
await shot('35-multi-terminal');

// 15. taskbar pinning: via icon menu, then drag-to-pin, then reorder
await evaluate(`window.__os?.windows.forEach(w => window.__os.close(w.id)); document.querySelector('[data-tray="widgets"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));`);
await sleep(400);
// icon-menu pins use real icon rects (windows previously covered these points)
const iconRects = await evaluate(`[...document.querySelectorAll('.desk-icon')].slice(0, 3).map(n => { const r = n.getBoundingClientRect(); return { x: r.left + 10, y: r.top + 10 }; })`);
for (const p of iconRects.result.value.slice(0, 2)) {
  await evaluate(`document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));`);
  await sleep(150);
  await ctxAt(p.x, p.y);
  await sleep(300);
  await evaluate(`[...document.querySelectorAll('.ctx-item')].find(b => b.textContent.includes('Pin to taskbar'))?.click()`);
  await sleep(250);
}
let pinCount = await evaluate(`document.querySelectorAll('#task-apps [data-pin]').length`);
console.log('pinned via menu (want 2):', pinCount.result?.value);
await shot('36-pinned');
// drag a desktop icon onto the taskbar → pins it
const dragPin = `
(async () => {
  const icon = [...document.querySelectorAll('.desk-icon')].find(i => i.title.startsWith('CADCraft')) || document.querySelectorAll('.desk-icon')[2];
  const r = icon.getBoundingClientRect();
  const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
  const tb = document.querySelector('#task-apps').getBoundingClientRect();
  const dx = tb.left + tb.width / 2, dy = tb.top + tb.height / 2;
  icon.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 6, clientX: sx, clientY: sy, button: 0 }));
  await new Promise(r2 => setTimeout(r2, 60));
  for (let i = 1; i <= 6; i++) {
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 6, clientX: sx + (dx - sx) * i / 6, clientY: sy + (dy - sy) * i / 6 }));
    await new Promise(r2 => setTimeout(r2, 50));
  }
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 6, clientX: dx, clientY: dy }));
})()`;
const pinsBefore = await evaluate(`(window.__os.taskbar.pinned || []).length`);
await evaluate(dragPin);
await sleep(400);
const pinsAfter = await evaluate(`(window.__os.taskbar.pinned || []).length`);
console.log('drag-to-pin:', JSON.stringify({ before: pinsBefore.result?.value, after: pinsAfter.result?.value }));
await shot('37-drag-pinned');
// reorder pinned: drag the first pinned button onto the LAST (3 pinned → real move)
const pinOrderBefore = await evaluate(`[...document.querySelectorAll('#task-apps [data-pin]')].map(b => b.title).join(',')`);
const reorderPin = `
(async () => {
  const btns = [...document.querySelectorAll('#task-apps [data-pin]')];
  const a = btns[0].getBoundingClientRect(), b = btns[btns.length - 1].getBoundingClientRect();
  const sx = a.left + a.width / 2, sy = a.top + a.height / 2;
  const dx = b.left + b.width / 2, dy = b.top + b.height / 2;
  btns[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: sx, clientY: sy, button: 0 }));
  await new Promise(r2 => setTimeout(r2, 60));
  for (let i = 1; i <= 5; i++) {
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: sx + (dx - sx) * i / 5, clientY: sy + (dy - sy) * i / 5 }));
    await new Promise(r2 => setTimeout(r2, 50));
  }
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: dx, clientY: dy }));
})()`;
await evaluate(reorderPin);
await sleep(400);
const pinOrderAfter = await evaluate(`[...document.querySelectorAll('#task-apps [data-pin]')].map(b => b.title).join(',')`);
console.log('pin reorder:', JSON.stringify({ before: pinOrderBefore.result?.value, after: pinOrderAfter.result?.value, changed: pinOrderBefore.result?.value !== pinOrderAfter.result?.value }));
// unpin via the pinned button's own menu
const firstPin = await evaluate(`(() => { const b = document.querySelector('#task-apps [data-pin]'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
await ctxAt(firstPin.result.value.x, firstPin.result.value.y);
await sleep(300);
await evaluate(`[...document.querySelectorAll('.ctx-item')].find(b => b.textContent.includes('Unpin from taskbar'))?.click()`);
await sleep(250);
const pinsUnpinned = await evaluate(`(window.__os.taskbar.pinned || []).length`);
console.log('after unpin (want 2):', pinsUnpinned.result?.value);

// 16. Add app… dialog → custom app lands on the desktop
await evaluate(`document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));`);
await sleep(150);
await ctxAt(700, 300);
await sleep(300);
await evaluate(`[...document.querySelectorAll('.ctx-item')].find(b => b.textContent.includes('Add app'))?.click()`);
await sleep(350);
await shot('38-addapp-dialog');
await evaluate(`(() => {
  const inputs = [...document.querySelectorAll('.addapp input')];
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(inputs[0], 'Test PWA');
  inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
  set.call(inputs[1], 'https://example.com');
  inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  const ta = document.querySelector('.addapp textarea');
  if (ta) { const sets = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; sets.call(ta, 'My custom web app'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
})()`);
await sleep(200);
await evaluate(`[...document.querySelectorAll('.addapp .btn')].find(b => b.textContent === 'Add app')?.click()`);
await sleep(350);
const custom = await evaluate(`({ count: window.__os.userApps.length, onDesktop: [...document.querySelectorAll('.desk-icon .lbl')].some(n => n.textContent === 'Test PWA') })`);
console.log('custom app:', JSON.stringify(custom.result?.value));
await shot('39-custom-app');

// 17. wallpaper image adjustments: fit=Tile + blur via the real controls
await evaluate(`window.__os?.setTheme({ wallpaper: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="%23131a24"/><circle cx="24" cy="24" r="14" fill="%23223750"/></svg>') });`);
await sleep(300);
const wpLayer = await evaluate(`({ exists: !!document.querySelector('#wallpaper'), dim: document.querySelector('#wallpaper')?.style.background.includes('linear-gradient') })`);
console.log('wallpaper layer:', JSON.stringify(wpLayer.result?.value));
await evaluate(`window.__os?.launch('settings')`);
await sleep(400);
await evaluate(`[...document.querySelectorAll('.set-nav')].find(b => b.textContent.includes('Appearance'))?.click()`);
await sleep(250);
await evaluate(`[...document.querySelectorAll('.seg-row .chip')].find(b => b.textContent === 'Tile')?.click()`);
await sleep(250);
await evaluate(`(() => {
  const blur = [...document.querySelectorAll('.wx-adj input[type="range"]')][2]; // Dim, Brightness, Blur, Saturation
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(blur, '8');
  blur.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(300);
await shot('40-wallpaper-tile');
const adj = await evaluate(`({ fit: window.__os.theme.fit, layerFilter: document.querySelector('#wallpaper')?.style.filter || '' })`);
console.log('adjustments:', JSON.stringify(adj.result?.value));

// 18. YouTube / Discord / Spotify / ChatGPT ship ON THE DESKTOP by default
const media = await evaluate(`['YouTube', 'Discord', 'Spotify', 'ChatGPT'].map(n => [...document.querySelectorAll('.desk-icon .lbl')].some(el => el.textContent === n))`);
console.log('desktop media apps (want [true,true,true,true]):', JSON.stringify(media.result?.value));
await shot('41-desktop-media');

// 19. persistence sanity: reload keeps installed store app + wallpaper + pins + custom app
await evaluate(`location.reload()`);
await sleep(2500);
const persisted = await evaluate(`({ installed: window.__os?.installed, icons: document.querySelectorAll('.desk-icon').length, wallpaper: !!document.querySelector('#wallpaper'), pinned: window.__os?.taskbar.pinned?.length, userApps: window.__os?.userApps?.length })`);
console.log('after reload:', JSON.stringify(persisted.result?.value));
await shot('42-reload-persisted');

// 20. calendar popup: single border (the old build drew panel chrome twice)
await evaluate(`document.querySelector('#clock')?.click()`);
await sleep(400);
const calBorder = await evaluate(`(() => {
  const pop = document.querySelector('.cal-pop');
  const cal = document.querySelector('.calendar');
  if (!pop || !cal) return { missing: true };
  const s = getComputedStyle(cal);
  return { calendarBorder: s.borderTopWidth, calendarBg: s.backgroundColor, popBorder: getComputedStyle(pop).borderTopWidth };
})()`);
console.log('calendar border (want calendarBorder 0px):', JSON.stringify(calBorder.result?.value));
await shot('43-calendar-single-border');
await clickAt(400, 300);
await sleep(250);

// 21. weather: REAL data check — rendered values vs a live Open-Meteo fetch.
// (In-page probe fetches hang intermittently in headless chromium on this
// box — flaky resolver — so the raw comparison runs node-side; the rendered
// value itself already proves the app's in-browser fetch succeeded.)
await evaluate(`localStorage.setItem('webos.weather.loc', JSON.stringify({ name: 'New York', label: 'New York, New York, United States', lat: 40.7128, lon: -74.006 })); location.href = '${BASE}?open=weather';`);
await sleep(3500);
const shownMetric = await evaluate(`({ temp: document.querySelector('.wx-temp')?.textContent || null, wind: [...document.querySelectorAll('.wx-stats li')].map(li => li.textContent).find(t => t.includes('Wind')) || null, err: document.querySelector('.wx-err')?.textContent || null })`);
console.log('weather rendered (metric):', JSON.stringify(shownMetric.result?.value));
await shot('44-weather-real-metric');
// units toggle: °C → °F (display + persistence + widget event)
await evaluate(`document.querySelector('.wx-units')?.click()`);
await sleep(400);
const wxUnits = await evaluate(`({ temp: document.querySelector('.wx-temp')?.textContent || null, unitsBtn: document.querySelector('.wx-units')?.textContent, stored: localStorage.getItem('webos.weather.units') })`);
console.log('weather rendered (imperial):', JSON.stringify(wxUnits.result?.value));
await shot('45-weather-imperial');
// node-side API truth for the same coordinates
const apiTemp = await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.006&current=temperature_2m,wind_speed_10m&timezone=auto&forecast_days=1')
  .then((r) => r.json()).then((d) => d.current.temperature_2m).catch(() => null);
if (typeof apiTemp === 'number') {
  const shownC = shownMetric.result?.value?.temp;
  const shownF = wxUnits.result?.value?.temp;
  console.log('weather match metric:', shownC === `${Math.round(apiTemp)}°C`, `(api ${apiTemp}°C → want ${Math.round(apiTemp)}°C, got ${shownC})`);
  console.log('weather match imperial:', shownF === `${Math.round(apiTemp * 9 / 5 + 32)}°F`, `(api ${apiTemp}°C → want ${Math.round(apiTemp * 9 / 5 + 32)}°F, got ${shownF})`);
} else {
  console.log('weather api fetch failed node-side too');
}

await idbCanary('pre-snap (after weather)');

// 22. snapping: drag terminal to the right edge → right half.
// Gesture IIFE is self-contained (down + moves + up); results land on window.
await evaluate(`location.href = '${BASE}'`);
await sleep(1800);
await evaluate(`window.__os?.launch('terminal')`);
await sleep(900);
const vw = (await evaluate(`window.innerWidth`)).result.value;
const vh = (await evaluate(`window.innerHeight`)).result.value;
const tbRect = await evaluate(`(() => { const w = window.__os.windows.at(-1); return { id: w.id, w: w.rect.w, h: w.rect.h }; })()`);
const TID = tbRect.result.value.id;
const dragGesture = (tx, ty, capture) => `
(() => {
  window.__dragResult = null;
  const t = document.querySelector('.win:last-child .titlebar');
  const r = t.getBoundingClientRect();
  const sx = r.left + Math.min(60, r.width / 2), sy = r.top + r.height / 2;
  const moves = [];
  t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5, clientX: sx, clientY: sy, button: 0 }));
  let i = 0;
  const step = () => {
    i++;
    const x = sx + (${tx} - sx) * i / 6, y = sy + (${ty} - sy) * i / 6;
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 5, clientX: x, clientY: y }));
    if (i === 6) {
      // React flushes setHint asynchronously — check the preview a tick later,
      // then release the pointer.
      setTimeout(() => {
        window.__previewSeen = !!document.querySelector('#snap-preview');
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5, clientX: x, clientY: y }));
        window.__dragResult = 'done';
      }, 90);
      return;
    }
    setTimeout(step, 45);
  };
  setTimeout(step, 45);
})()`;
await evaluate(dragGesture(vw - 2, 300));
await sleep(600);
const rightHalf = await evaluate(`(() => { const w = window.__os.windows.find(x => x.id === ${TID}); return { x: w.rect.x, w: w.rect.w, snap: w.snap, max: w.max }; })()`);
console.log('snap preview during drag (want true):', (await evaluate(`window.__previewSeen`)).result?.value);
console.log('snapped right half (want x≈vw/2, snap right):', JSON.stringify(rightHalf.result?.value), `vw=${vw}`);
await shot('46-snap-right');
// tear-off: drag the tiled window back toward the middle → floating size restored
await evaluate(dragGesture(Math.floor(vw / 2), 280));
await sleep(600);
const torn = await evaluate(`(() => { const w = window.__os.windows.find(x => x.id === ${TID}); return { w: w.rect.w, snap: w.snap }; })()`);
console.log('tear-off restored float (want w≈' + tbRect.result.value.w + ', snap null):', JSON.stringify(torn.result?.value));

// 23. keyboard tiling: Meta+arrows on the focused window
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', metaKey: true, bubbles: true }))`);
await sleep(300);
const kbLeft = await evaluate(`(() => { const w = window.__os.windows.find(x => x.id === ${TID}); return { x: w.rect.x, w: w.rect.w, snap: w.snap }; })()`);
console.log('Meta+Left (want x 0, w≈vw/2):', JSON.stringify(kbLeft.result?.value));
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', metaKey: true, bubbles: true }))`);
await sleep(250);
const kbUp = await evaluate(`(() => { const w = window.__os.windows.find(x => x.id === ${TID}); return { max: w.max, snap: w.snap }; })()`);
console.log('Meta+Up maximizes (want max true, snap null):', JSON.stringify(kbUp.result?.value));
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', metaKey: true, bubbles: true }))`);
await sleep(250);
const kbDown = await evaluate(`(() => { const w = window.__os.windows.find(x => x.id === ${TID}); return { max: w.max, snap: w.snap }; })()`);
console.log('Meta+Down unmaximizes (want max false, snap null):', JSON.stringify(kbDown.result?.value));
// corner quarter via drag to top-left
await evaluate(dragGesture(4, 4));
await sleep(600);
const quarter = await evaluate(`(() => { const w = window.__os.windows.find(x => x.id === ${TID}); return { snap: w.snap, x: w.rect.x, y: w.rect.y, w: w.rect.w, h: w.rect.h }; })()`);
console.log('top-left quarter (want snap tl, w≈vw/2, h≈vh/2):', JSON.stringify(quarter.result?.value), `vh=${vh}`);
await shot('47-snap-quarter');
await evaluate(`window.__os?.windows.forEach(w => window.__os.close(w.id))`);
await sleep(250);

// 24. Files app: VFS upload (synthetic drop), folder, preview, delete, persistence.
// Drag&drop is driven with a real DataTransfer carrying File objects.
await idbCanary('pre-files');
await evaluate(`location.href = '${BASE}?open=files';`);
await sleep(2000);
const filesUp = await waitFor(`!!document.querySelector('.files')`);
console.log('files app mounted:', filesUp);
const dropFile = (name, content, type) => `
(() => {
  const target = document.querySelector('.win[aria-label="Files"] .files') || document.querySelector('.files');
  if (!target) return 'no target';
  const dt = new DataTransfer();
  dt.items.add(new File([${JSON.stringify(content)}], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} }));
  const r = target.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + 60 };
  target.dispatchEvent(new DragEvent('dragover', { ...opts, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('drop', { ...opts, dataTransfer: dt }));
  return 'dropped';
})()`;
const drop1 = await evaluate(dropFile('hello.txt', 'hello webos files', 'text/plain'));
await sleep(800);
const f1 = await evaluate(`(() => {
  const tiles = [...document.querySelectorAll('.f-tile')];
  return { tiles: tiles.map(t => t.querySelector('.f-name')?.textContent), hello: tiles.some(t => t.querySelector('.f-name')?.textContent === 'hello.txt') };
})()`);
console.log('files drop:', JSON.stringify(drop1.result?.value), JSON.stringify(f1.result?.value));
if (!f1.result?.value?.hello) {
  console.log('DROP FAILED — idb counts:', JSON.stringify(await evalAsync(`
    const db = await new Promise((res, rej) => { const o = indexedDB.open('webos'); o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); });
    const out = { stores: [...db.objectStoreNames] };
    for (const s of out.stores) out[s] = await new Promise((res) => { const t = db.transaction(s, 'readonly'); const q = t.objectStore(s).count(); q.onsuccess = () => res(q.result); q.onerror = () => res(String(t.error)); });
    db.close(); return out;
  }`)), 'storage:', JSON.stringify(await evalAsync(`const e = await navigator.storage?.estimate?.(); return e ? { usage: e.usage, quota: e.quota } : 'no estimate';`)));
  console.log('page errors so far:', pageErrors.slice(-5));
}
await shot('48-files-upload');
// preview: click the hello.txt tile → <pre> with the text
await evaluate(`[...document.querySelectorAll('.f-tile')].find(t => t.querySelector('.f-name')?.textContent === 'hello.txt')?.click()`);
await sleep(500);
const pv = await evaluate(`({ pre: document.querySelector('.f-pv-body pre')?.textContent, name: document.querySelector('.f-pv-name')?.textContent })`);
console.log('files preview:', JSON.stringify(pv.result?.value));
await shot('49-files-preview');
await evaluate(`[...document.querySelectorAll('.f-preview .f-btn')].find(b => b.textContent === 'Close')?.click()`);
await sleep(250);
// new folder via the inline form
await evaluate(`[...document.querySelectorAll('.f-bar .f-btn')].find(b => b.textContent === 'New folder')?.click()`);
await sleep(250);
await evaluate(`(() => { const i = document.querySelector('.f-newdir input'); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(i, 'Docs'); i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed'; })()`);
await sleep(150);
await evaluate(`document.querySelector('.f-newdir input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
await sleep(500);
const dir = await evaluate(`[...document.querySelectorAll('.f-tile')].some(t => t.querySelector('.f-name')?.textContent === 'Docs')`);
console.log('folder created (want true):', dir.result?.value);
// enter folder, drop a second file inside it
await evaluate(`[...document.querySelectorAll('.f-tile')].find(t => t.querySelector('.f-name')?.textContent === 'Docs')?.click()`);
await sleep(400);
const crumb = await evaluate(`document.querySelector('.f-crumbs')?.textContent`);
await evaluate(dropFile('sub.txt', 'nested content', 'text/plain'));
await sleep(800);
const sub = await evaluate(`[...document.querySelectorAll('.f-tile')].some(t => t.querySelector('.f-name')?.textContent === 'sub.txt')`);
console.log('in-folder drop:', JSON.stringify({ crumb: crumb.result?.value, subThere: sub.result?.value }));
await shot('50-files-folder');
// delete sub.txt via its tile action (click event, no hover needed)
await evaluate(`(() => { const t = [...document.querySelectorAll('.f-tile')].find(t => t.querySelector('.f-name')?.textContent === 'sub.txt'); t?.querySelector('.f-actions button[title="Delete"]')?.click(); return !!t; })()`);
await sleep(500);
const subGone = await evaluate(`![...document.querySelectorAll('.f-tile')].some(t => t.querySelector('.f-name')?.textContent === 'sub.txt')`);
console.log('file deleted (want true):', subGone.result?.value);
const footer = await evaluate(`document.querySelector('.f-status')?.textContent`);
console.log('files footer:', JSON.stringify(footer.result?.value));
// persistence: reload → hello.txt + Docs folder survive (IndexedDB)
await evaluate(`location.reload()`);
await sleep(2000);
if (!(await waitFor(`!!document.querySelector('.files')`))) {
  await evaluate(`location.href = '${BASE}?open=files'`);
  await sleep(2000);
  await waitFor(`!!document.querySelector('.files')`);
}
const fp = await evaluate(`(() => {
  const names = [...document.querySelectorAll('.f-tile .f-name')].map(n => n.textContent);
  return { hello: names.includes('hello.txt'), docs: names.includes('Docs'), status: document.querySelector('.f-status')?.textContent };
})()`);
console.log('files persisted after reload (want hello+docs true):', JSON.stringify(fp.result?.value));
await shot('51-files-persisted');
await evaluate(`window.__os?.windows.forEach(w => window.__os.close(w.id)); location.href = '${BASE}'`);
await sleep(1800);

// 25. icon groups: new group → drag icon in → popup launch/rename/unfile → remove
await evaluate(`window.__os?.groups.forEach(g => window.__os.removeGroup(g.id))`); // clean slate (prior runs persist)
await sleep(300);
await ctxAt(700, 300);
await sleep(300);
await evaluate(`[...document.querySelectorAll('.ctx-item')].find(b => b.textContent.includes('New group'))?.click()`);
await sleep(400);
const grpNew = await evaluate(`({ groups: window.__os.groups.length, tile: !!document.querySelector('.group-tile'), lbl: document.querySelector('.group-tile .lbl')?.textContent })`);
console.log('group created:', JSON.stringify(grpNew.result?.value));
await shot('52-group-new');
const firstName = (await evaluate(`document.querySelector('#icon-grid .desk-icon:not(.group-tile) .lbl')?.textContent`)).result?.value;
// drag the first app icon onto the group tile (self-contained IIFE)
await evaluate(`(() => {
  const src = document.querySelector('#icon-grid .desk-icon:not(.group-tile)');
  const dst = document.querySelector('.group-tile');
  const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
  const sx = a.left + a.width / 2, sy = a.top + a.height / 2;
  const dx = b.left + b.width / 2, dy = b.top + b.height / 2;
  src.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 4, clientX: sx, clientY: sy, button: 0 }));
  let i = 0;
  const step = () => {
    i++;
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 4, clientX: sx + (dx - sx) * i / 5, clientY: sy + (dy - sy) * i / 5 }));
    if (i < 5) return setTimeout(step, 45);
    setTimeout(() => {
      window.__groupHint = dst.classList.contains('drop-hint');
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 4, clientX: dx, clientY: dy }));
    }, 90);
  };
  setTimeout(step, 45);
})()`);
await sleep(700);
const grpFilled = await evaluate(`(() => {
  const g = window.__os.groups[0];
  const labels = [...document.querySelectorAll('#icon-grid .desk-icon:not(.group-tile) .lbl')].map(n => n.textContent);
  return { members: g.appIds, hidden: !labels.includes(${JSON.stringify(firstName)}), count: document.querySelector('.group-tile .ver')?.textContent, hintSeen: window.__groupHint };
})()`);
console.log('icon filed into group (drop-hint seen + 1 member, label hidden):', JSON.stringify(grpFilled.result?.value), `src=${firstName}`);
await shot('53-group-filled');
// open popup: member row + launch from it
await evaluate(`document.querySelector('.group-tile')?.click()`);
await sleep(400);
const gpOpen = await evaluate(`({ popup: !!document.querySelector('.gp'), rows: [...document.querySelectorAll('.gp-app span')].map(n => n.textContent) })`);
console.log('group popup:', JSON.stringify(gpOpen.result?.value));
await shot('54-group-popup');
await evaluate(`document.querySelector('.gp-app')?.click()`);
await sleep(500);
const gpLaunch = await evaluate(`({ windows: window.__os.windows.length, popupClosed: !document.querySelector('.gp') })`);
console.log('launch from group:', JSON.stringify(gpLaunch.result?.value));
await evaluate(`window.__os?.windows.forEach(w => window.__os.close(w.id))`);
await sleep(250);
// rename via the popup input (set value, let React flush, THEN blur —
// onBlur reads the component state, so both events can't share one evaluate)
await evaluate(`document.querySelector('.group-tile')?.click()`);
await sleep(350);
await evaluate(`(() => { const i = document.querySelector('.gp-name'); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; i.focus(); set.call(i, 'Tools'); i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed'; })()`);
await sleep(250);
await evaluate(`document.querySelector('.gp-name').blur()`);
await sleep(400);
const renamed = await evaluate(`({ name: window.__os.groups[0]?.name, tile: document.querySelector('.group-tile .lbl')?.textContent })`);
console.log('group renamed (want Tools):', JSON.stringify(renamed.result?.value));
// unfile the member → back on the grid
await evaluate(`document.querySelector('.gp-rm')?.click()`);
await sleep(400);
const unfound = await evaluate(`({ members: window.__os.groups[0]?.appIds.length, back: document.querySelectorAll('#icon-grid .desk-icon:not(.group-tile)').length })`);
console.log('member removed from group:', JSON.stringify(unfound.result?.value));
// persistence: re-add member, reload, group + membership survive
await evaluate(`window.__os?.groupAdd(window.__os.groups[0].id, window.__os.apps[0].id)`);
await sleep(300);
await evaluate(`location.reload()`);
await sleep(2500);
const grpPersist = await evaluate(`({ groups: window.__os?.groups.map(g => ({ name: g.name, n: g.appIds.length })), tile: !!document.querySelector('.group-tile') })`);
console.log('groups persisted after reload:', JSON.stringify(grpPersist.result?.value));
// remove group via its context menu → members return
const gt = await evaluate(`(() => { const r = document.querySelector('.group-tile').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
await ctxAt(gt.result.value.x, gt.result.value.y);
await sleep(300);
await evaluate(`[...document.querySelectorAll('.ctx-item')].find(b => b.textContent.includes('Remove group'))?.click()`);
await sleep(400);
const grpGone = await evaluate(`({ groups: window.__os.groups.length, tile: !!document.querySelector('.group-tile'), icons: document.querySelectorAll('#icon-grid .desk-icon').length })`);
console.log('group removed (members return):', JSON.stringify(grpGone.result?.value));
await shot('55-group-removed');

// 26. terminal sqlite: real SQLite (sql.js WASM) persisted to IndexedDB.
await evaluate(`window.__os?.launch('terminal')`);
await sleep(700);
const termCmd = async (cmd) => {
  await evaluate(`(() => { const i = document.querySelector('.terminal input'); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(cmd)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(140);
  await evaluate(`document.querySelector('.terminal input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
};
const waitText = async (needle, tries = 25) => {
  for (let i = 0; i < tries; i++) {
    await sleep(400);
    const r = await evaluate(`[...document.querySelectorAll('.t-line')].map(l => l.textContent).join('\\n').includes(${JSON.stringify(needle)})`);
    if (r.result?.value) return true;
  }
  return false;
};
await termCmd('sqlite CREATE TABLE IF NOT EXISTS notes (id INTEGER, body TEXT);');
console.log('sqlite create+save:', await waitText('— saved'));
const runTag = `run${Date.now() % 100000}`;
await termCmd(`sqlite INSERT INTO notes VALUES (1, '${runTag}');`);
console.log('sqlite insert+save:', await waitText('— saved'));
await termCmd('sqlite SELECT id, body FROM notes;');
const sqlSel = await evaluate(`[...document.querySelectorAll('.t-line')].map(l => l.textContent).join('\\n')`);
console.log('sqlite select shows row (want true):', sqlSel.result?.value?.includes(runTag));
await shot('56-sqlite');
// persistence: reload → table + row survive (IndexedDB bytes → new SQL.Database)
await evaluate(`location.reload()`);
await sleep(2500);
await evaluate(`window.__os?.launch('terminal')`);
await sleep(700);
await termCmd('sqlite SELECT * FROM notes;');
console.log('sqlite row survived reload (want true):', await waitText(runTag));
await shot('57-sqlite-persisted');
await evaluate(`window.__os?.windows.forEach(w => window.__os.close(w.id))`);
await sleep(250);

// 28. Settings → About: reopen welcome; restore the default persona
await evaluate(`window.__os?.launch('settings')`);
await sleep(900);
await evaluate(`[...document.querySelectorAll('.set-nav')].find(b => b.textContent.includes('About'))?.click()`);
await sleep(300);
console.log('about has reopen button (want true):', (await evaluate(
  `[...document.querySelectorAll('.set-pane .btn')].some(b => b.textContent.includes('Show welcome'))`
)).result?.value);
await evaluate(`[...document.querySelectorAll('.set-pane .btn')].find(b => b.textContent.includes('Show welcome'))?.click()`);
await sleep(350);
await shot('58-welcome-reopened');
console.log('welcome reopened from about (want true):', (await evaluate(`!!document.querySelector('.welcome')`)).result?.value);
await evaluate(`[...document.querySelectorAll('.wl-p')].find(b => b.textContent.trim().startsWith('Windows'))?.click()`);
await sleep(350);
console.log('win persona restored (want win/bottom):', JSON.stringify((await evaluate(
  `({ p: document.body.dataset.persona, tb: document.body.dataset.tb })`
)).result?.value));
await evaluate(`document.querySelector('.wl-enter')?.click()`);
await sleep(300);

// 29. granular interface settings (Appearance → Interface, Taskbar, Desktop)
// Settings is still open on About — walk the rail.
await evaluate(`[...document.querySelectorAll('.set-nav')].find(b => b.textContent.includes('Appearance'))?.click()`);
await sleep(300);
const setRange = async (label, value) => {
  await evaluate(`(() => {
    const i = document.querySelector('input[aria-label="${label}"]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, '${value}');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(250);
};
await setRange('UI scale', 1.2);
await setRange('Transparency strength', 0.6);
await evaluate(`[...document.querySelectorAll('.set-pane .chip')].find(b => b.textContent === 'Large' && b.closest('[aria-label="Corner radius"]'))?.click()`);
await sleep(250);
await evaluate(`[...document.querySelectorAll('.set-pane .check-row input')].find(i => i.checked)?.closest('label')?.click()`); // animations off (first checked box = Animations)
await sleep(250);
console.log('interface settings (want 19px/animOff/radius 18px/chrome alpha~0.49):', JSON.stringify((await evaluate(
  `({ font: document.documentElement.style.fontSize, animOff: document.body.hasAttribute('data-anim-off'), radius: document.body.style.getPropertyValue('--radius'), chrome: getComputedStyle(document.documentElement).getPropertyValue('--chrome').trim() })`
)).result?.value));
await shot('59-interface-settings');

await evaluate(`[...document.querySelectorAll('.set-nav')].find(b => b.textContent.includes('Taskbar'))?.click()`);
await sleep(300);
await evaluate(`[...document.querySelectorAll('.set-pane .chip')].find(b => b.textContent === 'Center' && b.closest('[aria-label="Taskbar alignment"]'))?.click()`);
await sleep(200);
await evaluate(`[...document.querySelectorAll('.set-pane .chip')].find(b => b.textContent === 'Large' && b.closest('[aria-label="Taskbar icon size"]'))?.click()`);
await sleep(250);
await evaluate(`[...document.querySelectorAll('.set-nav')].find(b => b.textContent.includes('Desktop'))?.click()`);
await sleep(300);
await evaluate(`[...document.querySelectorAll('.set-pane .chip')].find(b => b.textContent === 'Roomy' && b.closest('[aria-label="Desktop grid spacing"]'))?.click()`);
await sleep(200);
await evaluate(`[...document.querySelectorAll('.set-pane .check-row input')].forEach(i => i.checked || i.click())`); // focus-follows-mouse on
await sleep(300);
console.log('layout settings (want center/lg/roomy):', JSON.stringify((await evaluate(
  `({ align: document.body.dataset.tbAlign, ico: document.body.dataset.tbIco, gap: document.body.dataset.deskGap, focusHover: !!document.querySelector('.set-pane .check-row input:checked') })`
)).result?.value));
// focus follows mouse: hover the Settings window itself after focusing the desktop first
await evaluate(`window.__os?.launch('calc')`);
await sleep(700);
await evaluate(`window.__os?.focus(window.__os.windows.find(w => w.appId === 'settings')?.id)`);
await sleep(150);
const hoverAt = await evaluate(`(() => {
  const calc = [...document.querySelectorAll('.win')].find(w => w.getAttribute('aria-label') === 'Calculator');
  if (!calc) return null;
  // settings (focused, on top) fully covers calc — park calc in the clear first
  window.__os.setRect(Number(calc.dataset.id), { x: 1240, y: 90, w: 240, h: 300 });
  return 'moved';
})()`);
await sleep(250);
const hoverPt = await evaluate(`(() => {
  const calc = [...document.querySelectorAll('.win')].find(w => w.getAttribute('aria-label') === 'Calculator');
  const r = calc.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 12), id: Number(calc.dataset.id) };
})()`);
await moveTo(hoverPt.result.value.x, hoverPt.result.value.y);
const hover = await evaluate(`({ id: ${hoverPt.result.value.id}, focused: window.__os.focused, topAtPoint: document.elementFromPoint(${hoverPt.result.value.x}, ${hoverPt.result.value.y})?.closest('.win')?.dataset.id || null })`);
console.log('hover focuses calc window (want id === focused):', JSON.stringify(hover.result?.value));
await evaluate(`window.__os?.windows.filter(w => w.appId === 'calc').forEach(w => window.__os.close(w.id))`);
await sleep(200);

// persistence: reload and confirm every knob came back
await evaluate(`location.reload()`);
await sleep(2500);
console.log('persisted after reload (want 1.2/0.6/18px/center/lg/roomy):', JSON.stringify((await evaluate(
  `({ scale: JSON.parse(localStorage.getItem('webos.ui')).scale, tr: JSON.parse(localStorage.getItem('webos.ui')).transparency, radius: JSON.parse(localStorage.getItem('webos.ui')).radius, align: document.body.dataset.tbAlign, ico: document.body.dataset.tbIco, gap: document.body.dataset.deskGap })`
)).result?.value));
// restore defaults for a clean desktop
await evaluate(`(() => { const ui = JSON.parse(localStorage.getItem('webos.ui')); ui.scale = 1; ui.transparency = 1; ui.radius = ''; ui.anim = true; ui.focusHover = false; localStorage.setItem('webos.ui', JSON.stringify(ui)); const tb = JSON.parse(localStorage.getItem('webos.taskbar')); tb.align = 'left'; tb.iconSize = 'md'; localStorage.setItem('webos.taskbar', JSON.stringify(tb)); const d = JSON.parse(localStorage.getItem('webos.desktop')); d.gap = 'normal'; localStorage.setItem('webos.desktop', JSON.stringify(d)); })()`);
await evaluate(`location.reload()`);
await sleep(2500);

// 30. AI chat — launch from the start menu's pinned tile
await evaluate(`document.getElementById('start-btn')?.click()`);
await sleep(400);
const askAi = await evaluate(`(() => { const b = [...document.querySelectorAll('#start-menu .sm-tile')].find(t => t.textContent.trim() === 'AI Chat'); if (!b) return null; b.click(); return 'pinned AI Chat tile'; })()`);
await sleep(700);
console.log('start menu pinned AI Chat tile:', JSON.stringify(askAi.result?.value));
const chatWin = await evaluate(`(() => { const w = [...document.querySelectorAll('.win')].find(w => w.getAttribute('aria-label') === 'AI Chat'); return w ? { id: Number(w.dataset.id), state: w.querySelector('.c-state')?.textContent, note: w.querySelector('.c-note')?.textContent.slice(0, 40) } : null; })()`);
console.log('chat window + honesty badge:', JSON.stringify(chatWin.result?.value));
await shot('34-chat');
// send a message: native textarea setter + input event, then Enter keydown
await evaluate(`(() => {
  const w = [...document.querySelectorAll('.win')].find(w => w.getAttribute('aria-label') === 'AI Chat');
  const ta = w.querySelector('.c-entry textarea');
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  set.call(ta, 'Hello, WebOS! Are you a real model?');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return 'sent';
})()`);
await sleep(700);
const reply = await evaluate(`(() => {
  const w = [...document.querySelectorAll('.win')].find(w => w.getAttribute('aria-label') === 'AI Chat');
  const msgs = [...w.querySelectorAll('.c-msg .c-bubble')];
  return { count: msgs.length, last: msgs.at(-1)?.textContent.slice(0, 60) };
})()`);
console.log('chat reply (want honest no-model text):', JSON.stringify(reply.result?.value));
await shot('35-chat-reply');
// history persists across reload
await evaluate(`location.reload()`);
await sleep(2500);
await evaluate(`(() => { const w = [...document.querySelectorAll('.desk-icon')].find(i => i.title?.startsWith('AI Chat')) || document.querySelector('#dock [data-app="chat"]'); if (w) w.click(); })()`);
await sleep(700);
const hist = await evaluate(`(() => {
  const w = [...document.querySelectorAll('.win')].find(w => w.getAttribute('aria-label') === 'AI Chat');
  return { stored: JSON.parse(localStorage.getItem('webos.chat.history') || '[]').length, shown: w ? w.querySelectorAll('.c-msg').length : -1 };
})()`);
console.log('chat history persisted (want stored>=2, shown>=2):', JSON.stringify(hist.result?.value));
// sidebar widget mirrors the thread
await evaluate(`document.querySelector('[data-tray="widgets"]')?.click()`);
await sleep(500);
const widget = await evaluate(`(() => {
  const el = document.querySelector('.widget-chat');
  return el ? { msgs: el.querySelectorAll('.widget-chat-msg').length, first: el.querySelector('.widget-chat-msg')?.textContent.slice(0, 30) } : null;
})()`);
console.log('sidebar chat widget syncs:', JSON.stringify(widget.result?.value));
await shot('36-chat-widget');
// clear history from the widget
await evaluate(`(() => { const b = [...document.querySelectorAll('.widget-chat ~ .row .btn, .widget .row .btn')].find(b => b.textContent.trim() === 'Clear'); if (b) b.click(); return !!b; })()`);
await sleep(300);
const cleared = await evaluate(`({ stored: JSON.parse(localStorage.getItem('webos.chat.history') || '[]').length, widget: document.querySelector('.widget-chat')?.querySelectorAll('.widget-chat-msg').length ?? 0 })`);
console.log('cleared (want stored 0):', JSON.stringify(cleared.result?.value));

// 31. start menu overhaul — close everything, then inspect the browse view
await evaluate(`(() => { document.querySelector('[data-tray="widgets"]')?.click(); window.__os?.windows.filter(w => w.appId === 'chat').forEach(w => window.__os.close(w.id)); })()`);
await sleep(400);
await evaluate(`document.getElementById('start-btn')?.click()`);
await sleep(500);
const smView = await evaluate(`(() => ({
  search: !!document.querySelector('#start-menu .sm-search'),
  pinned: document.querySelectorAll('#start-menu .sm-tile').length,
  cats: [...document.querySelectorAll('#start-menu .sm-cat-name')].map(c => c.textContent),
  rec: document.querySelectorAll('#start-menu .sm-rowset')[0]?.querySelectorAll('.sm-app').length || 0,
  user: document.querySelector('#start-menu .sm-who')?.textContent,
  pwr: document.querySelectorAll('#start-menu .sm-pwr').length,
}))()`);
console.log('start menu browse view (want search true, pinned 8, cats, user, pwr 2):', JSON.stringify(smView.result?.value));
await shot('37-start-menu');
// recommended should list chat (just launched)
const recHasChat = await evaluate(`[...document.querySelectorAll('#start-menu .sm-rowset')[0]?.querySelectorAll('.sm-app img') || []].length`);
// search: type "photo" → Enter launches first hit (PhotoCraft)
await evaluate(`(() => {
  const inp = document.querySelector('#start-menu .sm-search');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(inp, 'photo');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()`);
await sleep(400);
const hits = await evaluate(`(() => ({
  apps: [...document.querySelectorAll('#start-menu .sm-results .sm-app img')].map(i => i.closest('.sm-app').textContent.trim().split('\\n')[0]),
  secs: [...document.querySelectorAll('#start-menu .sm-results .sm-section')].map(s => s.textContent),
}))()`);
console.log('search "photo" hits:', JSON.stringify(hits.result?.value));
await shot('38-start-search');
await evaluate(`(() => { const hit = [...document.querySelectorAll('#start-menu .sm-results .sm-app')].find(b => b.textContent.trim().startsWith('PhotoCraft')); hit?.click(); })()`);
await sleep(900);
const launched = await evaluate(`(() => { const w = [...document.querySelectorAll('.win')].find(w => w.getAttribute('aria-label') === 'PhotoCraft'); return w ? 'PhotoCraft window' : 'MISSING'; })()`);
console.log('search hit click launches PhotoCraft:', launched);
// settings deep-link via search: "storage" → Storage section active
await evaluate(`(() => { const w = [...document.querySelectorAll('.win')].find(w => w.getAttribute('aria-label') === 'PhotoCraft'); if (w) window.__os.close(Number(w.dataset.id)); })()`);
await sleep(250);
await evaluate(`document.getElementById('start-btn')?.click()`);
await sleep(400);
await evaluate(`(() => {
  const inp = document.querySelector('#start-menu .sm-search');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(inp, 'storage');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(400);
await evaluate(`(() => { [...document.querySelectorAll('#start-menu .sm-results .sm-app')].at(-1)?.click(); })()`);
await sleep(800);
const settingsSec = await evaluate(`(() => {
  const w = [...document.querySelectorAll('.win')].find(w => w.getAttribute('aria-label') === 'Settings');
  return w ? { open: true, active: w.querySelector('.set-nav.on')?.textContent.trim().replace('💾', '') } : { open: false };
})()`);
console.log('settings deep-linked to (want Storage):', JSON.stringify(settingsSec.result?.value));
await evaluate(`(() => { [...document.querySelectorAll('.win')].forEach(w => window.__os.close(Number(w.dataset.id))); })()`);
await sleep(250);
// recommended row now has PhotoCraft (launched above)
await evaluate(`document.getElementById('start-btn')?.click()`);
await sleep(400);
const recommended = await evaluate(`[...document.querySelectorAll('#start-menu .sm-rowset')][0]?.querySelectorAll('.sm-app').length || 0`);
console.log('recommended row entries (want >=1):', recommended.result?.value);
// power menu: shut down → halt overlay → power on (reload)
await evaluate(`[...document.querySelectorAll('#start-menu .sm-pwr')].at(-1)?.click()`);
await sleep(400);
const halted = await evaluate(`({ halt: !!document.getElementById('halt'), text: document.getElementById('halt')?.querySelector('h2')?.textContent })`);
console.log('shutdown overlay (want halt true / System halted):', JSON.stringify(halted.result?.value));
await shot('39-halt');
await evaluate(`document.querySelector('#halt .btn')?.click()`);
await sleep(2500);
const back = await evaluate(`({ menu: !!document.getElementById('start-menu'), boot: !!document.body })`);
console.log('power on → reloaded, start menu closed:', JSON.stringify(back.result?.value));

// 32. wosh — the xterm.js shell
const typeLine = async (text) => {
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch }, sessionId);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }, sessionId);
  }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }, sessionId);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
  await sleep(350);
};
await evaluate(`window.__os.launch('terminal')`);
await sleep(1200);
const termRect = await evaluate(`(() => { const w = [...document.querySelectorAll('.win')].find(w => w.getAttribute('aria-label') === 'Terminal'); const r = w.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
await clickAt(termRect.result.value.x, termRect.result.value.y);
await sleep(300);
await typeLine('help');
const helpOut = await evaluate(`document.querySelector('.xterm-rows')?.textContent.includes('wosh — the WebOS shell')`);
console.log('terminal help (want true):', helpOut.result?.value);
await shot('40-terminal');
// get/set on a settings path — mutates real OS state
await typeLine('set ui.scale 1.15');
const setOut = await evaluate(`({
  said: document.querySelector('.xterm-rows')?.textContent.includes('ui.scale = 1.15'),
  stored: JSON.parse(localStorage.getItem('webos.ui')).scale,
  font: getComputedStyle(document.documentElement).fontSize,
})`);
console.log('wosh set ui.scale (want true/1.15/18px):', JSON.stringify(setOut.result?.value));
await typeLine('get ui.scale');
const getOut = await evaluate(`document.querySelector('.xterm-rows')?.textContent.includes('ui.scale = 1.15')`);
console.log('wosh get ui.scale (want true):', getOut.result?.value);
// tab completion: "set taskbar.pos" + Tab completes to taskbar.position
const typeText = async (text) => {
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch }, sessionId);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }, sessionId);
  }
  await sleep(200);
};
await typeText('set taskbar.pos');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
await sleep(200);
const afterTab = await evaluate(`document.querySelector('.xterm-rows')?.textContent.split('\\n').filter(Boolean).at(-1)`);
console.log('buffer line after Tab (want … set taskbar.position ):', JSON.stringify(afterTab.result?.value));
await typeText('top'); // completion already appended the separating space
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }, sessionId);
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
await sleep(400);
const tabDone = await evaluate(`({ said: document.querySelector('.xterm-rows')?.textContent.includes('taskbar.position = top'), stored: JSON.parse(localStorage.getItem('webos.taskbar')).position })`);
console.log('tab completion → set taskbar.position top:', JSON.stringify(tabDone.result?.value));
// persona switch from the shell
await typeLine('persona tui');
await sleep(300);
const personaOut = await evaluate(`({ attr: document.body.dataset.persona, said: document.querySelector('.xterm-rows')?.textContent.includes('persona: tui') })`);
console.log('wosh persona tui (want tui/true):', JSON.stringify(personaOut.result?.value));
await shot('41-terminal-tui');
await typeLine('persona win');
await typeLine('set ui.scale 1');
await typeLine('windows');
const winList = await evaluate(`document.querySelector('.xterm-rows')?.textContent.includes('terminal')`);
console.log('wosh windows lists terminal (want true):', winList.result?.value);
// close all — including the terminal itself
await typeLine('close all');
await sleep(400);
const allClosed = await evaluate(`document.querySelectorAll('#windows .win').length`);
console.log('wosh close all → 0 windows (want 0):', allClosed.result?.value);

// 33. assets — real craft icons, photo wallpapers, FX wallpapers
const craftIcons = await evaluate(`(() => {
  const imgs = [...document.querySelectorAll('.desk-icon img[src*="icons/craft/"]')];
  return { count: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length };
})()`);
console.log('craft icons on desktop (count==loaded, want 8/8):', JSON.stringify(craftIcons.result?.value));
await shot('42-craft-icons');
// photo wallpaper via Appearance → Photos → Dunes
await evaluate(`window.__os.launch('settings', { initial: 'appearance' })`);
await sleep(700);
await evaluate(`[...document.querySelectorAll('.win .store-cats .chip')].find(c => c.textContent === 'Photos')?.click()`);
await sleep(300);
const dunes = await evaluate(`(() => {
  const b = [...document.querySelectorAll('.win .preset')].find(p => p.textContent.trim() === 'Dunes');
  return b ? (b.click(), { found: true }) : { found: false };
})()`);
await sleep(500);
const dunesApplied = await evaluate(`({
  theme: JSON.parse(localStorage.getItem('webos.theme')).wallpaper,
  layer: document.getElementById('wallpaper')?.style.background.includes('dunes.jpg'),
})`);
console.log('photo wallpaper dunes (want dunes.jpg/dunes.jpg):', JSON.stringify({ ...dunes.result?.value, ...dunesApplied.result?.value }));
await shot('43-photo-wallpaper');
// FX wallpaper via Appearance → Interactive → Starfield
await evaluate(`[...document.querySelectorAll('.win .store-cats .chip')].find(c => c.textContent === 'Interactive')?.click()`);
await sleep(300);
await evaluate(`[...document.querySelectorAll('.win .preset')].find(p => p.textContent.includes('Starfield'))?.click()`);
await sleep(600);
const fx = await evaluate(`(() => {
  const c = document.getElementById('fx-wallpaper');
  return {
    theme: JSON.parse(localStorage.getItem('webos.theme')).wallpaper,
    canvas: !!c,
    painted: c ? c.width > 0 && c.height > 0 : false,
  };
})()`);
console.log('fx wallpaper starfield (want fx:starfield/true/true):', JSON.stringify(fx.result?.value));
await sleep(700);
await shot('44-fx-wallpaper');
const fxShot2 = await evaluate(`(() => { const c = document.getElementById('fx-wallpaper'); return c ? c.toDataURL().length : 0; })()`);
await sleep(600);
const fxShot2b = await evaluate(`(() => { const c = document.getElementById('fx-wallpaper'); return c ? c.toDataURL().length : 0; })()`);
console.log('fx animating (dataURL length changes between frames, want differs):', fxShot2.result?.value, 'vs', fxShot2b.result?.value);
// back to theme default
await evaluate(`[...document.querySelectorAll('.win .preset')].find(p => p.textContent.includes('Theme default'))?.click()`);
await sleep(400);
await evaluate(`[...document.querySelectorAll('.win')].forEach(w => window.__os.close(Number(w.dataset.id)))`);

// 34. persona look & feel + chrome knobs + About → Reset look & layout
const radiusFor = () => evaluate(`getComputedStyle(document.querySelector('.desk-icon')).borderRadius`);
const personas = ['win', 'mac', 'linux', 'bsd', 'android', 'tui'];
for (const id of personas) {
  await evaluate(`window.__os.setPersona('${id}')`);
  await sleep(450);
  const st = await evaluate(`(() => {
    const cs = getComputedStyle(document.body);
    return {
      persona: document.body.dataset.persona,
      tb: document.body.dataset.tb,
      radiusVar: cs.getPropertyValue('--radius').trim(),
      fontFamily: cs.fontFamily.slice(0, 30),
    };
  })()`);
  console.log(`persona ${id}:`, JSON.stringify(st.result?.value));
  await shot(`45-persona-${id}`);
}
// chrome knobs — set, verify CSS reacts, verify About reset clears them
await evaluate(`window.__os.launch('calc')`);
await sleep(600);
await evaluate(`window.__os.setUi({ font: 'mono' })`);
await evaluate(`window.__os.setUi({ shadow: 'off' })`);
await evaluate(`window.__os.setUi({ tbSide: 'left' })`);
await evaluate(`window.__os.setUi({ titleAlign: 'center' })`);
await sleep(400);
const knobs = await evaluate(`(() => {
  const win = [...document.querySelectorAll('.win')].at(-1);
  return {
    font: getComputedStyle(document.body).fontFamily.includes('mono') ? 'mono' : 'other',
    shadow: getComputedStyle(win).boxShadow,
    tbFlow: getComputedStyle(win.querySelector('.titlebar')).flexDirection,
    title: getComputedStyle(win.querySelector('.titlebar .t')).position,
    attrs: ['tbside', 'titlealign', 'font', 'shadow'].map(k => document.body.dataset[k] || '-').join(','),
  };
})()`);
console.log('chrome knobs applied (mono/none/row-reverse/absolute):', JSON.stringify(knobs.result?.value));
await shot('46-knobs');
// About → Reset look & layout (confirm auto-accepted)
await evaluate(`window.confirm = () => true`);
await evaluate(`window.__os.launch('settings', { initial: 'about' })`);
await sleep(700);
await evaluate(`[...document.querySelectorAll('.win .btn')].find(b => b.textContent.includes('Reset look'))?.click()`);
await sleep(500);
const afterReset = await evaluate(`(() => {
  const win = [...document.querySelectorAll('.win')].at(-1);
  return {
    persona: document.body.dataset.persona,
    theme: JSON.parse(localStorage.getItem('webos.theme')).preset,
    scale: JSON.parse(localStorage.getItem('webos.ui')).scale,
    fontAttr: document.body.dataset.font || '(empty)',
    shadow: win ? getComputedStyle(win).boxShadow.slice(0, 30) : '(no win)',
    flow: win ? getComputedStyle(win.querySelector('.titlebar')).flexDirection : '',
  };
})()`);
console.log('after Reset look & layout (win/midnight/1/(empty)/shadowed/row):', JSON.stringify(afterReset.result?.value));
await evaluate(`window.__os.closeAll ? window.__os.closeAll() : [...document.querySelectorAll('.win')].forEach(w => window.__os.close(Number(w.dataset.id)))`);
await sleep(300);

// 35. taskbar grouping + centered/cascade placement + right-click close +
//     single-instance apps + taskbar settings deep link
await evaluate(`window.confirm = () => true`);
// two calc windows: one grouped button, centered first window, +28 cascade
await evaluate(`window.__os.launch('calc')`);
await sleep(600);
await evaluate(`window.__os.launch('calc')`);
await sleep(600);
const group1 = await evaluate(`(() => {
  const btns = [...document.querySelectorAll('#task-apps [data-cm="app:calc"]')];
  const wins = window.__os ? JSON.parse(JSON.stringify(window.__os.windows || [])) : [];
  const rects = [...document.querySelectorAll('.win')].map((w) => {
    const r = w.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top) };
  });
  return { buttons: btns.length, dot: !!btns[0]?.querySelector('.pin-dot'), winCount: wins.filter(w => w.appId === 'calc').length, rects };
})()`);
console.log('calc grouped (want 1 button/dot/2 wins):', JSON.stringify(group1.result?.value));
await shot('47-grouped');
// right-click the grouped button -> close all windows from the menu
const cbtn = await evaluate(`(() => { const b = document.querySelector('#task-apps [data-cm="app:calc"]'); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
await ctxAt(cbtn.result.value.x, cbtn.result.value.y);
await sleep(400);
const menu1 = await evaluate(`[...document.querySelectorAll('.ctx-menu .ctx-item span')].map((s) => s.textContent)`);
console.log('calc ctx menu items:', JSON.stringify(menu1.result?.value));
await shot('48-ctx-close');
await evaluate(`[...document.querySelectorAll('.ctx-menu .ctx-item')].find((b) => b.textContent.includes('Close all'))?.click()`);
await sleep(400);
const closed1 = await evaluate(`document.querySelectorAll('.win').length`);
console.log('after Close all (want 0):', closed1.result?.value);
// centered first window + cascade offset for the second
await evaluate(`window.__os.launch('calc')`);
await sleep(500);
const r1 = await evaluate(`(() => { const r = document.querySelector('.win').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), vw: innerWidth, vh: innerHeight }; })()`);
await evaluate(`window.__os.launch('calc')`);
await sleep(500);
const r2 = await evaluate(`(() => { const ws = [...document.querySelectorAll('.win')]; const r = ws[ws.length - 1].getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) }; })()`);
console.log('first calc rect:', JSON.stringify(r1.result?.value), 'second (want +28):', JSON.stringify(r2.result?.value));
await evaluate(`[...document.querySelectorAll('.win')].forEach((w) => window.__os.close(Number(w.dataset.id)))`);
await sleep(300);
// single-instance: weather opens once
await evaluate(`window.__os.launch('weather')`);
await sleep(700);
await evaluate(`window.__os.launch('weather')`);
await sleep(700);
const single = await evaluate(`(() => {
  const btn = document.querySelector('#task-apps [data-cm="app:weather"]');
  return { wins: document.querySelectorAll('.win').length, buttons: btn ? 1 : 0 };
})()`);
console.log('weather single-instance (want 1/1):', JSON.stringify(single.result?.value));
await evaluate(`[...document.querySelectorAll('.win')].forEach((w) => window.__os.close(Number(w.dataset.id)))`);
await sleep(300);
// taskbar right-click -> Taskbar settings deep link
// empty stretch between the app buttons and the tray (right-30 lands on the clock)
const tb = await evaluate(`(() => {
  const bar = document.querySelector('#taskbar').getBoundingClientRect();
  const apps = document.querySelector('#task-apps').getBoundingClientRect();
  const tray = document.querySelector('#tray').getBoundingClientRect();
  return { x: Math.round((apps.right + tray.left) / 2), y: Math.round(bar.top + bar.height / 2) };
})()`);
await ctxAt(tb.result.value.x, tb.result.value.y);
await sleep(400);
await shot('49-taskbar-ctx');
await evaluate(`[...document.querySelectorAll('.ctx-menu .ctx-item')].find((b) => b.textContent.includes('Taskbar settings'))?.click()`);
await sleep(900);
const deep = await evaluate(`(() => {
  const wins = [...document.querySelectorAll('.win')];
  const sec = [...document.querySelectorAll('.win h3, .win [role="radiogroup"]')].length;
  const body = wins.at(-1)?.textContent || '';
  return { open: wins.length, isTaskbarSection: body.includes('Auto-hide the taskbar') };
})()`);
console.log('taskbar settings deep link (want true):', JSON.stringify(deep.result?.value));
await evaluate(`[...document.querySelectorAll('.win')].forEach((w) => window.__os.close(Number(w.dataset.id)))`);
await sleep(200);

console.log('done');
clearTimeout(watchdog);
killTree();
process.exit(0);
