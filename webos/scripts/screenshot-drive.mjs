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
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 1. desktop home
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

// 3. calendar popup
await evaluate(`location.href = '${BASE}'`);
await sleep(1500);
await evaluate(`document.querySelector('#clock')?.click()`);
await sleep(400);
await shot('09-calendar');

// 4. context menus
await evaluate(`document.querySelector('.popup-backdrop')?.click()`);
await sleep(200);
await evaluate(`document.querySelector('#desktop').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 700, clientY: 300 }))`);
await sleep(300);
await shot('10-ctx-desktop');
await evaluate(`document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));`);
await sleep(150);
await evaluate(`document.querySelector('#desktop').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1490, clientY: 880 }))`);
await sleep(300);
await shot('11-ctx-flipped');

// 5. start menu + store
await evaluate(`document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })); document.querySelector('#start-btn')?.click()`);
await sleep(300);
await shot('12-start-menu');
await evaluate(`[...document.querySelectorAll('.sm-link')].find(b => b.textContent.includes('App Store'))?.click()`);
await sleep(400);
await shot('13-store');

// 6. settings
await evaluate(`document.querySelector('#start-btn')?.click()`);
await sleep(200);
await evaluate(`[...document.querySelectorAll('.sm-link')].find(b => b.textContent.includes('Settings'))?.click()`);
await sleep(400);
await shot('14-settings');

// 7. terminal + titlebar context menu
await evaluate(`window.__os?.launch('terminal')`);
await sleep(400);
await shot('15-terminal');
await evaluate(`document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));`);
await sleep(150);
await evaluate(`document.querySelector('.win').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 500, clientY: 140, cancelable: true }))`);
await sleep(250);
await shot('16-ctx-titlebar');

console.log('done');
chrome.kill();
process.exit(0);
