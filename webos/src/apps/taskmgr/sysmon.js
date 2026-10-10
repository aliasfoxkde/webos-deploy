/* Pure helpers for the Task Manager. The web gives a JS process a narrow
   window into itself — no per-tab CPU, no process table — so every metric
   here is the honest one: heap, event-loop lag, frame rate, long tasks,
   storage. Rendering + sampling live in TaskManager.jsx. */

/* 90_500 → '1m 30s', 7_380_000 → '2h 03m', 190_000_000 → '2d 4h' */
export function fmtUptime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/* Safe percentage 0-100 (null when there is no whole to compare). */
export function pct(part, whole) {
  if (!whole || whole < 0) return null;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/* Frame count over elapsed ms → frames/sec, rounded. */
export function fpsFrom(frames, elapsedMs) {
  if (elapsedMs <= 0) return 0;
  return Math.round((frames * 1000) / elapsedMs);
}

/* Ring-buffer append for the sparklines (fixed capacity, oldest dropped). */
export function pushSeries(series, value, cap = 60) {
  const next = series.length >= cap ? series.slice(series.length - cap + 1) : series.slice();
  next.push(value);
  return next;
}

/* SVG polyline points for a series, baseline at the bottom. Pure so the
   sparkline geometry is unit-testable. */
export function sparkPoints(data, w, h, max) {
  const cap = max > 0 ? max : 1;
  const n = data.length;
  if (!n) return '';
  return data
    .map((v, i) => {
      const x = n === 1 ? w : (i / (n - 1)) * w;
      const y = h - Math.max(0, Math.min(1, v / cap)) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/* JS heap snapshot — performance.memory is Chromium-only; everywhere else
   this reports null and the UI says the browser doesn't expose it. */
export function heapInfo() {
  const m = typeof performance !== 'undefined' && performance.memory;
  if (!m) return null;
  return { used: m.usedJSHeapSize, limit: m.jsHeapSizeLimit };
}

/* Window rows for the Processes tab: newest z on top, honest status. */
export function classifyWindows(windows, focusedId = null, now = Date.now()) {
  return [...windows]
    .sort((a, b) => b.z - a.z)
    .map((w) => ({
      id: w.id,
      appId: w.appId,
      status: w.id === focusedId ? 'focused' : w.min ? 'suspended' : 'running',
      born: w.born ?? null,
      uptime: w.born ? now - w.born : null,
    }));
}

/* localStorage footprint rows (Startup/Resources tab): every webos.* key
   with an approximate UTF-16 byte size, largest first. */
export function storageRows(ls = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!ls) return [];
  return Object.keys(ls)
    .filter((k) => k.startsWith('webos.'))
    .map((k) => ({ key: k, bytes: (ls.getItem(k)?.length ?? 0) * 2 }))
    .sort((a, b) => b.bytes - a.bytes);
}
