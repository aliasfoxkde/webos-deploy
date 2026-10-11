// Task Manager: the pure sysmon metrics (uptime/percent/sparkline math) and
// the component's honest web-platform fallbacks (no per-app CPU, no heap in
// non-Chromium, storage + service worker via navigator).
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';
import {
  fmtUptime, pct, fpsFrom, pushSeries, sparkPoints, heapInfo,
  classifyWindows, storageRows,
} from '../src/apps/taskmgr/sysmon.js';
import TaskManager from '../src/apps/taskmgr/TaskManager.jsx';

describe('sysmon pure helpers', () => {
  it('fmtUptime renders compact human spans', () => {
    expect(fmtUptime(0)).toBe('0s');
    expect(fmtUptime(5_000)).toBe('5s');
    expect(fmtUptime(90_500)).toBe('1m 30s');
    expect(fmtUptime(7_380_000)).toBe('2h 03m');
    expect(fmtUptime(190_000_000)).toBe('2d 4h');
    expect(fmtUptime(-5)).toBe('0s'); // clamped, no negative time
  });

  it('pct is safe: null without a whole, clamped to 0-100', () => {
    expect(pct(10, 0)).toBeNull();
    expect(pct(10, -5)).toBeNull();
    expect(pct(50, 100)).toBe(50);
    expect(pct(150, 100)).toBe(100);
    expect(pct(-1, 100)).toBe(0);
  });

  it('fpsFrom converts frames over elapsed ms; zero elapsed is 0', () => {
    expect(fpsFrom(60, 1000)).toBe(60);
    expect(fpsFrom(30, 500)).toBe(60);
    expect(fpsFrom(10, 0)).toBe(0);
    expect(fpsFrom(1, -5)).toBe(0);
  });

  it('pushSeries is a fixed-capacity ring', () => {
    expect(pushSeries([], 1)).toEqual([1]);
    expect(pushSeries([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
    const orig = [1, 2];
    pushSeries(orig, 3);
    expect(orig).toEqual([1, 2]); // input untouched
  });

  it('sparkPoints maps a series into the viewBox and clamps', () => {
    expect(sparkPoints([], 100, 28, 10)).toBe('');
    expect(sparkPoints([5], 100, 28, 10)).toBe('100.0,14.0'); // lone point: right edge, mid-height
    expect(sparkPoints([0, 10], 100, 28, 10)).toBe('0.0,28.0 100.0,0.0');
    expect(sparkPoints([99], 100, 28, 10)).toBe('100.0,0.0'); // over max clamps to the top
    expect(sparkPoints([-3], 100, 28, 10)).toBe('100.0,28.0'); // negatives clamp to baseline
    expect(sparkPoints([5], 100, 28, 0)).toBe('100.0,0.0'); // max<=0 treated as 1
  });

  it('heapInfo reports Chromium memory or null elsewhere', () => {
    if (performance.memory) delete performance.memory; // happy-dom may not set it
    expect(heapInfo()).toBeNull();
    performance.memory = { usedJSHeapSize: 10, jsHeapSizeLimit: 100 };
    expect(heapInfo()).toEqual({ used: 10, limit: 100 });
    delete performance.memory;
  });

  it('classifyWindows sorts newest-z first with honest statuses', () => {
    const now = 10_000;
    const rows = classifyWindows(
      [
        { id: 1, appId: 'calc', z: 1, min: false, born: 4_000 },
        { id: 2, appId: 'notepad', z: 3, min: true, born: 8_500 },
        { id: 3, appId: 'files', z: 2, min: false, born: undefined },
      ],
      1,
      now
    );
    expect(rows.map((r) => r.id)).toEqual([2, 3, 1]); // z desc
    expect(rows[0].status).toBe('suspended'); // minimized reads as suspended
    expect(rows[0].uptime).toBe(1_500);
    expect(rows[1].status).toBe('running');
    expect(rows[1].uptime).toBeNull(); // unknown birth → unknown uptime
    expect(rows[2].status).toBe('focused');
    expect(classifyWindows([])).toEqual([]);
  });

  it('storageRows lists only webos.* keys, largest first, UTF-16 sized', () => {
    localStorage.clear();
    localStorage.setItem('webos.b', '12345'); // 5 chars → 10 bytes
    localStorage.setItem('webos.a', '1234567890'); // 20 bytes
    localStorage.setItem('other.key', 'xxxxxxxxxx'); // ignored
    expect(storageRows()).toEqual([
      { key: 'webos.a', bytes: 20 },
      { key: 'webos.b', bytes: 10 },
    ]);
    expect(storageRows(null)).toEqual([]);
  });
});

describe('TaskManager component', () => {
  let cur;
  const Probe = () => {
    cur = useOS();
    return null;
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('webos.theme', '{"preset":"midnight"}');
    cleanup();
    document.body.innerHTML = '';
    // no frame loop and no observers: the component must tolerate their absence
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    vi.stubGlobal('PerformanceObserver', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete navigator.storage;
    delete navigator.serviceWorker;
    delete navigator.hardwareConcurrency;
  });

  const mount = () => render(
    <OSProvider>
      <Probe />
      <TaskManager />
    </OSProvider>
  );

  it('processes tab lists live windows with status, uptime and End task', async () => {
    mount();
    await act(async () => { cur.launch('calc'); cur.launch('notepad'); });
    await act(async () => {
      cur.minimize(cur.windows[0].id);
      cur.focus(cur.windows[1].id);
    });
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Processes');
    expect(screen.queryByText('No apps are running.')).toBeNull(); // rows exist
    expect(screen.getAllByText('focused')).toHaveLength(1);
    expect(screen.getByText('suspended')).toBeTruthy();
    expect(screen.getAllByText('End task').length).toBe(2);
    expect(screen.getByText(/2 windows · up /)).toBeTruthy();
    expect(screen.getByText(/per-app CPU isn.t observable/)).toBeTruthy(); // honesty note
  });

  it('End task closes just that window', async () => {
    mount();
    await act(async () => { cur.launch('calc'); cur.launch('notepad'); });
    const rows = [...document.querySelectorAll('tbody tr')];
    fireEvent.click(rows[0].querySelector('.tm-end')); // top row = newest window
    await act(async () => {});
    expect(cur.windows).toHaveLength(1);
    expect(cur.windows[0].appId).toBe('calc');
  });

  it('the empty table says so honestly', async () => {
    mount();
    expect(await screen.findByText('No apps are running.')).toBeTruthy();
    expect(screen.queryByText('End task')).toBeNull(); // no rows → nothing to end
  });

  it('performance tab reports the browser s honest fallbacks', async () => {
    navigator.storage = { estimate: async () => ({ usage: 0, quota: 0 }), persisted: async () => false };
    navigator.serviceWorker = { getRegistrations: async () => [] };
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Performance' }));
    expect(await screen.findByText('Memory (JS heap)')).toBeTruthy();
    expect(screen.getByText('n/a')).toBeTruthy();
    expect(screen.getByText('not exposed by this browser')).toBeTruthy();
    expect(screen.getByText('0 fps')).toBeTruthy();
    expect(screen.getByText('0 ms')).toBeTruthy();
    expect(await screen.findByText('none')).toBeTruthy(); // no service workers
    expect(screen.getByText('0 B of 0 B')).toBeTruthy(); // zero quota: no % whole to show
  });

  it('performance facts pick up real navigator values when present', async () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    navigator.storage = {
      estimate: async () => ({ usage: 50, quota: 100 }),
      persisted: async () => true,
    };
    navigator.serviceWorker = { getRegistrations: async () => [{}, {}] };
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Performance' }));
    expect(await screen.findByText(/8/)).toBeTruthy(); // cores
    expect(await screen.findByText('active')).toBeTruthy(); // 2 registrations
    expect(await screen.findByText(/50 B of 100 B \(50\.00%\) · persistent/)).toBeTruthy();
    delete navigator.serviceWorker;
    delete navigator.storage;
    delete navigator.hardwareConcurrency;
  });

  it('startup tab inventories localStorage settings', async () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Startup & storage' }));
    expect(await screen.findByText('Restored at launch')).toBeTruthy();
    expect(screen.getByText('webos.theme')).toBeTruthy();
    expect(screen.getByText(/There are no login programs to disable/)).toBeTruthy();
    expect(screen.getByText(/IndexedDB/)).toBeTruthy();
  });
});
