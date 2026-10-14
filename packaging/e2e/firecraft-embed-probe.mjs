// FireCraft embed probe: boots the built WebOS dist in real Chromium, clicks
// the FireCraft desktop icon (the real user path), and waits for the
// FireCraft bridge contract to fire — the bundle posts
// { source: "firecraft", type: "ready" } to its parent once the wasm shell
// is up (FireCraft docs/WEBOS.md). Proof = ready received + iframe live.
//
// Lives in packaging/e2e/ so it survives scratch GC. From the repo root:
//   node packaging/e2e/firecraft-embed-probe.mjs              # local dist
//   FC_BASE_URL=https://artcraft-webos.pages.dev/ node ...    # production
// Env overrides: WEBOS_DIR (shell checkout), CHROME, SWEEP_SHOTS.
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const PORT = 4219;
const SHOTS = process.env.SWEEP_SHOTS || '/var/tmp/sweep-shots';
mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.FC_BASE_URL || null;
const srv = BASE ? null : spawn('npx', ['vite', 'preview', '--host', '127.0.0.1',
  '--port', String(PORT), '--strictPort'],
  { cwd: process.env.WEBOS_DIR || '/nas/Temp/repos/webos-deploy/webos', detached: true, stdio: 'pipe' });
if (!BASE) {
  for (let i = 0; i < 40; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
}

const profile = mkdtempSync(join(tmpdir(), 'fcprobe-'));
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

let mid = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++mid; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
};
await send('Page.enable'); await send('Runtime.enable');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  return r.result.value;
};

// record every firecraft bridge message from before any page script runs
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__fc = [];
  window.addEventListener('message', (e) => {
    if (e.data && e.data.source === 'firecraft') window.__fc.push(e.data.type);
  });` });

await send('Page.navigate', { url: BASE || `http://127.0.0.1:${PORT}/` });
await evalJs(`new Promise((res) => {
  const check = () => (document.querySelector('.desk-icon') ? res() : setTimeout(check, 200));
  check();
})`);
await wait(1500);
// dismiss the first-run welcome (real user path: the Enter button)
await evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /Enter WebOS/.test(b.textContent));
  if (btn) btn.click();
})()`);
await wait(800);

const clickIcon = await evalJs(`(() => {
  const icons = [...document.querySelectorAll('.desk-icon')];
  const fc = icons.find((n) => n.textContent.includes('FireCraft'));
  if (!fc) return 'MISSING: ' + icons.map((n) => n.textContent.trim()).join('|');
  fc.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return 'clicked';
})()`);
console.log('icon:', clickIcon);

// wait for the bridge ready signal (wasm boot takes a few seconds)
let ready = false;
for (let i = 0; i < 60; i++) {
  const types = await evalJs('window.__fc');
  if (types.includes('ready')) { ready = true; break; }
  await wait(1000);
}
const iframe = await evalJs(`(() => {
  const f = document.querySelector('.win iframe');
  return f ? { src: f.src, w: f.clientWidth, h: f.clientHeight } : null;
})()`);
const bridge = await evalJs('window.__fc');

console.log('bridge messages:', JSON.stringify(bridge));
console.log('iframe:', JSON.stringify(iframe));

const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync(`${SHOTS}/firecraft-embed.png`, Buffer.from(shot.data, 'base64'));

chr.kill(); if (srv) process.kill(-srv.pid, 'SIGTERM');
await wait(1500); // let chromium flush its profile before removing it
try { rmSync(profile, { recursive: true, force: true }); } catch {}

const ok = ready && iframe && iframe.src.includes('firecraft-web.pages.dev') && iframe.w > 100 && iframe.h > 100;
console.log(ok ? 'FIRECRAFT EMBED: PASS (bridge ready + iframe live)' : 'FIRECRAFT EMBED: FAIL');
process.exit(ok ? 0 : 1);
