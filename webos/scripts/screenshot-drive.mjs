// Dev tool: CDP-driven screenshot session against a running WebOS preview
// server (`npm run preview`), for visual verification without a browser.
// Usage: node scripts/screenshot-drive.mjs [base-url] [out-dir]
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

const BASE = process.argv[2] || 'http://localhost:5180/';
const OUT = process.argv[3] || '/var/tmp/webos-shots';
const DEBUG_PORT = 9333;
mkdirSync(OUT, { recursive: true });

const chrome = spawn('/usr/bin/chromium', [
  '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${DEBUG_PORT}`, '--window-size=1520,900', 'about:blank',
], { stdio: 'ignore' });
process.on('exit', () => chrome.kill());
await sleep(1500);

const { webSocketDebuggerUrl } = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`).then((r) => r.json());
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
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
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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

// 18. store carries YouTube / Discord / Spotify
await evaluate(`window.__os?.launch('store')`);
await sleep(450);
const media = await evaluate(`['YouTube', 'Discord', 'Spotify'].map(n => document.body.textContent.includes(n))`);
console.log('store media apps (want [true,true,true]):', JSON.stringify(media.result?.value));
await shot('41-store-media');

// 19. persistence sanity: reload keeps installed store app + wallpaper + pins + custom app
await evaluate(`location.reload()`);
await sleep(2500);
const persisted = await evaluate(`({ installed: window.__os?.installed, icons: document.querySelectorAll('.desk-icon').length, wallpaper: !!document.querySelector('#wallpaper'), pinned: window.__os?.taskbar.pinned?.length, userApps: window.__os?.userApps?.length })`);
console.log('after reload:', JSON.stringify(persisted.result?.value));
await shot('42-reload-persisted');

console.log('done');
chrome.kill();
process.exit(0);
