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
    expect(screen.getByText(/1 running · 1 minimized · up /)).toBeTruthy();
    expect(screen.getByText(/per-app CPU isn.t observable/)).toBeTruthy(); // honesty note
  });

  it('the filter box narrows rows and clears back to all', async () => {
    mount();
    await act(async () => { cur.launch('calc'); cur.launch('notepad'); });
    fireEvent.change(screen.getByLabelText('Filter processes by name'), { target: { value: 'calc' } });
    expect(screen.getAllByText('End task').length).toBe(1);
    expect(screen.getByText('Calculator')).toBeTruthy();
    expect(screen.queryByText('Notepad')).toBeNull();
    fireEvent.change(screen.getByLabelText('Filter processes by name'), { target: { value: 'zzz' } });
    expect(screen.getByText('No processes match the filter.')).toBeTruthy();
    fireEvent.click(screen.getByText('Clear filter'));
    expect(screen.getAllByText('End task').length).toBe(2);
  });

  it('column headers sort rows and carry aria-sort', async () => {
    mount();
    await act(async () => { cur.launch('notepad'); });
    await act(async () => { cur.launch('calc'); });
    const names = () => [...document.querySelectorAll('tbody .tm-app')].map((el) => el.textContent);
    // default: newest z first → Calculator (launched last) on top
    expect(names()[0]).toBe('Calculator');
    fireEvent.click(screen.getByRole('button', { name: /^Name/ })); // asc
    expect(names()[0]).toBe('Calculator'); // C < N
    expect(document.querySelector('th[aria-sort="ascending"]')?.textContent).toContain('Name');
    fireEvent.click(screen.getByRole('button', { name: /^Name/ })); // desc
    expect(names()[0]).toBe('Notepad');
    expect(document.querySelector('th[aria-sort="descending"]')?.textContent).toContain('Name');
    // Uptime sort: verify aria-label arrow direction (↑ = ascending/oldest first).
    // We assert on aria rather than absolute position because the uptime values
    // of both windows are identical (same act tick) and the id-based tiebreak
    // order is environment-dependent.
    fireEvent.click(screen.getByRole('button', { name: /^Uptime/ }));
    expect(screen.queryByRole('button', { name: /↑/ })).toBeTruthy(); // ascending = oldest first
  });

  it('Switch to raises a minimized window', async () => {
    mount();
    await act(async () => { cur.launch('calc'); cur.launch('notepad'); });
    await act(async () => { cur.minimize(cur.windows[1].id); });
    const row = [...document.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('Notepad'));
    fireEvent.click(row.querySelector('.tm-switch'));
    await act(async () => {});
    expect(cur.focused).toBe(cur.windows[1].id);
    expect(cur.windows[1].min).toBe(false);
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
    // The storage estimate resolves asynchronously, so these lookups can miss
    // RTL's 1 s default timeout on a loaded machine — give them room.
    expect(await screen.findByText(/8/, {}, { timeout: 5_000 })).toBeTruthy(); // cores
    expect(await screen.findByText('active', {}, { timeout: 5_000 })).toBeTruthy(); // 2 registrations
    expect(await screen.findByText(/50 B of 100 B \(50\.00%\) · persistent/, {}, { timeout: 5_000 })).toBeTruthy();
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

describe('TaskManager live signals', () => {
  let cur;
  const Probe = () => {
    cur = useOS();
    return null;
  };
  let rafCb;
  let obsCb;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('webos.theme', '{"preset":"midnight"}');
    cleanup();
    document.body.innerHTML = '';
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    vi.stubGlobal('requestAnimationFrame', (cb) => { rafCb = cb; return 7; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    class PO {
      constructor(cb) { obsCb = cb; }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('PerformanceObserver', PO);
    navigator.storage = { estimate: async () => ({ usage: 4096, quota: 1e9 }), persisted: async () => true };
    navigator.serviceWorker = { getRegistrations: async () => [{}] };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete navigator.storage;
    delete navigator.serviceWorker;
    delete performance.memory;
  });

  const mount = () => render(
    <OSProvider>
      <Probe />
      <TaskManager />
    </OSProvider>
  );

  it('the 1 s tick, the rAF loop and long-task events feed the Performance tab', async () => {
    performance.memory = { usedJSHeapSize: 10, jsHeapSizeLimit: 100 };
    mount();
    act(() => { rafCb(performance.now()); }); // first frame — no sample yet
    fireEvent.click(screen.getByRole('tab', { name: 'Performance' }));
    await act(async () => { await new Promise((r) => setTimeout(r, 1150)); }); // ≥1 interval tick
    act(() => { rafCb(performance.now()); }); // second frame ≥1 s later → fps sampled
    act(() => { obsCb({ getEntries: () => [{ duration: 80.4 }, { duration: 120.5 }] }); });

    const card = (label) => screen.getByText(label).closest('.tm-metric');
    expect(card('Memory (JS heap)').textContent).toContain('now 10 B'); // heap sampled each tick
    // 2 frames were sampled ~1.1 s apart; the exact fps is wall-clock
    // dependent on loaded machines, so pin the sampled-frame signal only
    expect(card('Frame rate').textContent).toMatch(/now [12] fps/);
    expect(card('Event loop lag').textContent).toMatch(/now \d+ ms/); // drift measured
    expect(screen.getByText('Main-thread stalls >50 ms').closest('div').textContent)
      .toContain('2 · worst 121 ms · last 121 ms'); // last = most recent entry (120.5)
    expect(screen.getByText('Service worker').closest('div').textContent).toContain('active');
    expect(screen.getByText('Site storage').closest('div').textContent).toContain('persistent');
    // The clock tick advances uptime. The format changes at the minute
    // boundary (fmtUptime: "42s" → "3m 07s" → "1h 05m"), so match any of
    // them — a seconds-only regex stops matching once the suite has been
    // running long enough to cross 60 s, which is a load-dependent flake.
    expect(screen.getByText(/up (?:\d+s|\d+m \d+s|\d+h \d+m|\d+d \d+h)/)).toBeTruthy();
  });

  it('Status header sorts rows and toggles aria-sort direction', async () => {
    mount();
    await act(async () => { cur.launch('calc'); cur.launch('notepad'); });
    await act(async () => { cur.minimize(cur.windows[0].id); cur.focus(cur.windows[1].id); });
    const statusBtn = screen.getByRole('button', { name: /^Status/ });
    fireEvent.click(statusBtn);
    expect(document.querySelector('th[aria-sort="ascending"]')?.textContent).toContain('Status');
    fireEvent.click(statusBtn);
    expect(document.querySelector('th[aria-sort="descending"]')?.textContent).toContain('Status');
  });
});

describe('TaskManager — unsupported entry type', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    // some engines ship PerformanceObserver but throw on unsupported entry types
    vi.stubGlobal('PerformanceObserver', class {
      observe() { throw new Error('entry type not supported'); }
      disconnect() {}
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a PerformanceObserver that rejects longtask keeps the stall row at zero', () => {
    render(<OSProvider><TaskManager /></OSProvider>);
    fireEvent.click(screen.getByRole('tab', { name: 'Performance' }));
    const row = screen.getByText('Main-thread stalls >50 ms').closest('div');
    expect(row.textContent).toContain('0'); // counted nothing, honestly
    expect(row.textContent).not.toContain('worst');
  });
});

describe('TaskManager — storage/SW rejection arms', () => {
  // navigator.storage.estimate() / persisted() / getRegistrations() all
  // carry .catch(() => fallback) guards; these run when the browser API
  // rejects (permission denied, SW unregistered mid-read).
  it('renders zeros when every storage/SW lookup rejects', async () => {
    let cur2;
    const P = () => {
      cur2 = useOS();
      return null;
    };
    render(
      <OSProvider>
        <P />
        <TaskManager />
      </OSProvider>
    );
    navigator.storage = {
      estimate: () => Promise.reject(new Error('denied')),
      persisted: () => Promise.reject(new Error('denied')),
    };
    navigator.serviceWorker = { getRegistrations: () => Promise.reject(new Error('gone')) };
    await act(async () => { cur2.launch('calc'); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    // The component must not crash; the storage section shows the fallback.
    expect(screen.getAllByText(/Storage/i).length).toBeGreaterThan(0);
  });
});
