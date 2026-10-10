// Task Manager — an honest web take on the Windows classic. A browser page
// is one process: there is no per-app CPU and no kernel process table, so
// Processes lists live windows (status, uptime, End task), Performance
// charts the real signals a page CAN see (heap, event-loop lag, FPS, long
// tasks, storage), and Startup inventories what the OS actually restores.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../../os/state.jsx';
import { fmtBytes } from '../../os/format.js';
import {
  fmtUptime, pct, fpsFrom, pushSeries, sparkPoints, heapInfo,
  classifyWindows, storageRows,
} from './sysmon.js';
import './taskmgr.css';

const CAP = 60; // sparkline history (one sample per second)
/* Captured once at chunk load (≈ app open), never during render. */
const BOOT_AT = Date.now() - (typeof performance !== 'undefined' ? performance.now() : 0);

/* One metric card: label, big number, sub-detail, SVG sparkline. */
function Metric({ label, value, sub, series, max, accent }) {
  return (
    <div className="tm-metric">
      <div className="tm-metric-head">
        <span className="tm-metric-label">{label}</span>
        <span className="tm-metric-value">{value}</span>
      </div>
      <svg className="tm-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={sparkPoints(series, 100, 28, max)} fill="none" stroke={accent} strokeWidth="1.5" />
      </svg>
      <div className="tm-metric-sub">{sub}</div>
    </div>
  );
}

export default function TaskManager() {
  const os = useOS();
  const [tab, setTab] = useState('processes');
  const [now, setNow] = useState(() => Date.now());
  const [heap, setHeap] = useState(heapInfo);
  const [heapSeries, setHeapSeries] = useState([]);
  const [lag, setLag] = useState(0);
  const [lagSeries, setLagSeries] = useState([]);
  const [fps, setFps] = useState(0);
  const [fpsSeries, setFpsSeries] = useState([]);
  const [longTasks, setLongTasks] = useState({ count: 0, last: 0, worst: 0 });
  const [storage, setStorage] = useState(null); // { usage, quota, persisted }
  const [swState, setSwState] = useState(null);
  const alive = useRef(true);

  const rows = useMemo(
    () => classifyWindows(os.windows, os.focused, now),
    [os.windows, os.focused, now],
  );

  useEffect(() => () => { alive.current = false; }, []);

  /* -- per-second sampling: uptime tick, heap, event-loop lag -- */
  useEffect(() => {
    let expected = 0;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const h = heapInfo();
      if (h) {
        setHeap(h);
        setHeapSeries((s) => pushSeries(s, h.used, CAP));
      }
      // drift between when the tick SHOULD have fired and when it did:
      // sustained growth means the main thread is saturated
      const drift = Math.max(0, t - expected);
      expected = t + 1000;
      setLag(drift);
      setLagSeries((s) => pushSeries(s, drift, CAP));
    }, 1000);
    expected = Date.now() + 1000;
    return () => clearInterval(id);
  }, []);

  /* -- frames-per-second via rAF, sampled every second -- */
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const loop = (t) => {
      frames += 1;
      if (t - last >= 1000) {
        if (alive.current) {
          const v = fpsFrom(frames, t - last);
          setFps(v);
          setFpsSeries((s) => pushSeries(s, v, CAP));
        }
        frames = 0;
        last = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* -- long tasks: main-thread stalls >50ms -- */
  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return undefined;
    let observer;
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          setLongTasks((lt) => ({ count: lt.count + 1, last: Math.round(e.duration), worst: Math.max(lt.worst, Math.round(e.duration)) }));
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      return undefined; // entry type unsupported
    }
    return () => observer.disconnect();
  }, []);

  /* -- storage quota + persistence + service worker, once on mount -- */
  useEffect(() => {
    (async () => {
      const est = await navigator.storage?.estimate?.().catch(() => null);
      const persisted = await navigator.storage?.persisted?.().catch(() => false);
      if (alive.current) setStorage({ usage: est?.usage ?? 0, quota: est?.quota ?? 0, persisted: Boolean(persisted) });
      const regs = await navigator.serviceWorker?.getRegistrations?.().catch(() => []);
      if (alive.current) setSwState(regs?.length ? 'active' : 'none');
    })();
  }, []);

  const appOf = (id) => os.findApp(id);
  const heapUsedPct = heap ? pct(heap.used, heap.limit) : null;
  const storePct = storage ? pct(storage.usage, storage.quota) : null;
  const settingsRows = useMemo(() => storageRows(), []);
  const totalSettings = settingsRows.reduce((n, r) => n + r.bytes, 0);

  return (
    <div className="taskmgr">
      <header className="tm-head">
        <div className="tm-tabs" role="tablist" aria-label="Task Manager sections">
          {[['processes', 'Processes'], ['performance', 'Performance'], ['startup', 'Startup & storage']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'on' : ''}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="tm-spring" />
        <span className="tm-summary">
          {rows.length} window{rows.length === 1 ? '' : 's'} · up {fmtUptime(now - BOOT_AT)}
        </span>
      </header>

      {tab === 'processes' && (
        <div className="tm-body">
          <table className="tm-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col">Uptime</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const app = appOf(r.appId);
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="tm-app">
                        {app?.icon && <img src={app.icon} alt="" width="18" height="18" />}
                        {app?.name ?? r.appId}
                      </span>
                    </td>
                    <td>
                      <span className={`tm-status ${r.status}`}>{r.status}</span>
                    </td>
                    <td>{r.uptime != null ? fmtUptime(r.uptime) : '—'}</td>
                    <td className="tm-actions">
                      <button
                        type="button"
                        className="tm-end"
                        onClick={() => os.close(r.id)}
                        disabled={os.windows.length === 0}
                        title="Close this window"
                      >
                        End task
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={4} className="tm-none">No apps are running.</td></tr>
              )}
            </tbody>
          </table>
          <p className="tm-note">
            A browser tab is a single process — per-app CPU isn&apos;t observable from
            the web, so windows are tracked by state and uptime instead. Minimized
            windows stay &ldquo;minimized&rdquo;, not suspended: their JS keeps running.
          </p>
        </div>
      )}

      {tab === 'performance' && (
        <div className="tm-body tm-perf">
          <div className="tm-grid">
            <Metric
              label="Memory (JS heap)"
              value={heap ? fmtBytes(heap.used) : 'n/a'}
              sub={heap ? `${(heapUsedPct ?? 0).toFixed(1)}% of ${fmtBytes(heap.limit)} reserved` : 'not exposed by this browser'}
              series={heapSeries}
              max={heap?.limit}
              accent="#4ade80"
            />
            <Metric
              label="Event loop lag"
              value={`${lag} ms`}
              sub="main-thread scheduling delay (1 s ticks)"
              series={lagSeries}
              max={250}
              accent="#fbbf24"
            />
            <Metric
              label="Frame rate"
              value={`${fps} fps`}
              sub="requestAnimationFrame throughput"
              series={fpsSeries}
              max={120}
              accent="#38bdf8"
            />
          </div>
          <div className="tm-facts">
            <div><span>Main-thread stalls &gt;50 ms</span><b>{longTasks.count}{longTasks.worst ? ` · worst ${longTasks.worst} ms · last ${longTasks.last} ms` : ''}</b></div>
            <div><span>Logical cores</span><b>{navigator.hardwareConcurrency ?? 'unknown'}</b></div>
            <div><span>Device memory</span><b>{navigator.deviceMemory ? `≈ ${navigator.deviceMemory} GB` : 'not exposed'}</b></div>
            <div><span>Network</span><b>{navigator.connection?.effectiveType ?? 'unknown'}</b></div>
            <div><span>Service worker</span><b>{swState ?? 'checking…'}</b></div>
            <div>
              <span>Site storage</span>
              <b>
                {storage ? `${fmtBytes(storage.usage)} of ${fmtBytes(storage.quota)} (${storePct?.toFixed(2)}%)${storage.persisted ? ' · persistent' : ''}` : 'estimating…'}
              </b>
            </div>
          </div>
        </div>
      )}

      {tab === 'startup' && (
        <div className="tm-body">
          <h3 className="tm-section">Restored at launch</h3>
          <p className="tm-note">
            WebOS restores your settings — persona, theme, taskbar pins, desktop
            layout, installed apps — but does not re-open windows from the last
            session. There are no login programs to disable: nothing runs at
            startup except the shell itself.
          </p>
          <h3 className="tm-section">Settings in localStorage ({fmtBytes(totalSettings)})</h3>
          <table className="tm-table">
            <thead>
              <tr><th scope="col">Key</th><th scope="col">Size</th></tr>
            </thead>
            <tbody>
              {settingsRows.map((r) => (
                <tr key={r.key}><td>{r.key}</td><td>{fmtBytes(r.bytes)}</td></tr>
              ))}
              {!settingsRows.length && <tr><td colSpan={2} className="tm-none">No settings stored yet.</td></tr>}
            </tbody>
          </table>
          <p className="tm-note">
            Larger data (Files disk, app databases) lives in IndexedDB — the
            {storage ? ` ${fmtBytes(storage.usage)} ` : ' '}
            shown under Performance. Settings → Storage can wipe it all.
          </p>
        </div>
      )}
    </div>
  );
}
