// Task Manager pure helpers: uptime, series, sparkline geometry, windows.
import { describe, it, expect } from 'vitest';
import {
  fmtUptime, pct, fpsFrom, pushSeries, sparkPoints, heapInfo,
  classifyWindows, storageRows,
} from '../src/apps/taskmgr/sysmon.js';

describe('uptime formatting', () => {
  it('renders seconds, minutes, hours, days', () => {
    expect(fmtUptime(0)).toBe('0s');
    expect(fmtUptime(42_000)).toBe('42s');
    expect(fmtUptime(90_000)).toBe('1m 30s');
    expect(fmtUptime(7_380_000)).toBe('2h 03m');
    expect(fmtUptime(190_000_000)).toBe('2d 4h');
  });

  it('never goes negative', () => {
    expect(fmtUptime(-5)).toBe('0s');
  });
});

describe('ratio + fps math', () => {
  it('pct clamps and handles missing wholes', () => {
    expect(pct(50, 200)).toBe(25);
    expect(pct(300, 200)).toBe(100);
    expect(pct(-5, 200)).toBe(0);
    expect(pct(1, 0)).toBeNull();
    expect(pct(1, undefined)).toBeNull();
  });

  it('fpsFrom converts frames + elapsed to a rounded rate', () => {
    expect(fpsFrom(60, 1000)).toBe(60);
    expect(fpsFrom(30, 500)).toBe(60);
    expect(fpsFrom(10, 0)).toBe(0);
    expect(fpsFrom(7, 700)).toBe(10);
  });
});

describe('series + sparkline', () => {
  it('pushSeries caps length and drops the oldest', () => {
    let s = [];
    for (let i = 0; i < 5; i += 1) s = pushSeries(s, i, 3);
    expect(s).toEqual([2, 3, 4]);
    expect(pushSeries([], 9, 60)).toEqual([9]);
  });

  it('does not mutate the input series', () => {
    const s = [1, 2];
    pushSeries(s, 3, 60);
    expect(s).toEqual([1, 2]);
  });

  it('sparkPoints maps values into the viewbox, baseline at h', () => {
    expect(sparkPoints([], 100, 28, 10)).toBe('');
    expect(sparkPoints([0], 100, 28, 10)).toBe('100.0,28.0');
    expect(sparkPoints([10], 100, 28, 10)).toBe('100.0,0.0');
    const two = sparkPoints([0, 10], 100, 28, 10);
    expect(two).toBe('0.0,28.0 100.0,0.0');
  });

  it('sparkPoints clamps values above max', () => {
    expect(sparkPoints([99], 100, 28, 10)).toBe('100.0,0.0');
  });

  it('sparkPoints tolerates a non-positive max', () => {
    expect(sparkPoints([5], 100, 28, 0)).toBe('100.0,0.0');
  });
});

describe('heapInfo', () => {
  it('returns null when the browser hides performance.memory', () => {
    // happy-dom does not implement performance.memory
    expect(heapInfo()).toBeNull();
  });
});

describe('classifyWindows', () => {
  const win = (id, z, min = false, born = 1000) => ({ id, appId: `app${id}`, z, min, born });

  it('sorts by z descending and reports status incl. focused', () => {
    const rows = classifyWindows([win(1, 11), win(2, 13, true), win(3, 12)], 3, 5000);
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      [2, 'suspended'],
      [3, 'focused'],
      [1, 'running'],
    ]);
  });

  it('computes uptime from born, null when unknown', () => {
    const rows = classifyWindows([win(1, 5, false, 2000)], null, 5000);
    expect(rows[0].uptime).toBe(3000);
    const noBorn = classifyWindows([{ id: 9, appId: 'x', z: 1, min: false }], null, 5000);
    expect(noBorn[0].uptime).toBeNull();
  });
});

describe('storageRows', () => {
  it('lists webos.* keys by size, largest first', () => {
    localStorage.setItem('webos.b', 'x'.repeat(10));
    localStorage.setItem('webos.a', 'y'.repeat(30));
    localStorage.setItem('other.z', 'z'.repeat(100));
    const rows = storageRows();
    expect(rows.map((r) => r.key)).toEqual(['webos.a', 'webos.b']);
    expect(rows[0].bytes).toBe(60); // UTF-16: 30 chars × 2
    localStorage.clear();
  });

  it('is empty with no webos keys', () => {
    localStorage.clear();
    expect(storageRows()).toEqual([]);
  });
});
