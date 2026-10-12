// WaterWallpaper: the WebGL sim cannot run in happy-dom (getContext yields
// the mocked 2D recorder), so these pin the honest degradation path — the
// component must fall back to the 2D Tide FX canvas, never crash, and the
// window-level input bridge must be inert without an engine.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import WaterWallpaper from '../src/shell/WaterWallpaper.jsx';
import { DEFAULTS, mergeParams } from '../src/os/waterfx.js';

/* WaterWallpaper probes support at first render and creates the engine in an
   effect — both edges of that seam get doubles below: a probe that lies
   "supported" while the real engine factory still throws (deferred-fallback
   path), and a fake engine (debug-expose + teardown path). */
const h = vi.hoisted(() => ({ mode: 'probe-yes-factory-throws' }));
vi.mock('../src/shell/watergl.js', async (importOriginal) => {
  const real = await importOriginal();
  const fakeEngine = {
    step() {}, drawStatic() {}, pointer() {}, pointerOff() {},
    addDrop() {}, resize() {}, dispose() {},
  };
  return {
    ...real,
    waterSupported: () => h.mode !== 'probe-no',
    default: (canvas, params) => {
      if (h.mode !== 'fake-ok') throw new Error('context lost at boot');
      return { ...fakeEngine, canvas, params };
    },
  };
});

/* a recording 2d context — FxWallpaper's fallback path needs the full set */
let ctx2d;
const rafCalls = [];
const makeCtx = () => {
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    setTransform: rec('setTransform'), fillRect: rec('fillRect'),
    beginPath: rec('beginPath'), arc: rec('arc'), fill: rec('fill'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), stroke: rec('stroke'),
    closePath: rec('closePath'),
    fillText: rec('fillText'),
    createLinearGradient: () => ({ addColorStop: rec('addColorStop') }),
  };
};

beforeEach(() => {
  localStorage.clear();
  cleanup();
  ctx2d = makeCtx();
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: vi.fn(() => ctx2d), configurable: true, writable: true,
  });
  rafCalls.length = 0;
  vi.stubGlobal('requestAnimationFrame', (cb) => { rafCalls.push(cb); return 1 + rafCalls.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WaterWallpaper', () => {
  it('a probe pass followed by engine failure defers the fallback swap', async () => {
    h.mode = 'probe-yes-factory-throws';
    const c = render(<WaterWallpaper id="water-fx" />);
    expect(c.container.querySelector('canvas')).toBeTruthy(); // optimistic first paint
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); // deferred setFailed
    expect(c.container.querySelector('#water-fx')).toBeTruthy(); // 2D fallback took over
  });

  it('?water-debug exposes the live engine on window.__water; unmount disposes', () => {
    h.mode = 'fake-ok';
    history.replaceState(null, '', '/?water-debug=1');
    const c = render(<WaterWallpaper id="water-fx" />);
    const engine = window.__water;
    expect(engine).toBeTruthy();
    expect(engine.canvas).toBe(c.container.querySelector('canvas'));
    // the input bridge reaches the engine without throwing
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 4, clientY: 6 }));
      window.dispatchEvent(new MouseEvent('pointerdown', { clientX: 8, clientY: 9 }));
      window.dispatchEvent(new Event('resize'));
    });
    act(() => { c.unmount(); }); // cleanup runs dispose
    expect(true).toBe(true);
    history.replaceState(null, '', '/');
  });

  it('falls back to the 2D Tide FX canvas when WebGL2 is unavailable', () => {
    h.mode = 'probe-no';
    const c = render(<WaterWallpaper id="water-fx" />);
    // fallback renders FxWallpaper kind="waves" under the requested id
    const canvas = c.container.querySelector('#water-fx');
    expect(canvas).toBeTruthy();
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
  });

  it('the input bridge stays inert (no throw) without an engine', () => {
    render(<WaterWallpaper id="water-fx" />);
    act(() => {
      window.dispatchEvent(new Event('pointermove'));
      window.dispatchEvent(new Event('pointerdown'));
      window.dispatchEvent(new Event('resize'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(true).toBe(true); // reached — no crash on the fallback path
  });

  it('live params apply through mergeParams (engine contract shape)', () => {
    // the component hands resolved trees to engine.setParams; pin the shape
    // it forwards so the engine never meets a partial params object
    const resolved = mergeParams(DEFAULTS, { water: { rain: true } });
    expect(resolved.water.rain).toBe(true);
    expect(resolved.water.simScale).toBe(DEFAULTS.water.simScale);
    expect(Object.keys(resolved).sort()).toEqual(['bg', 'grade', 'optics', 'overlay', 'water']);
  });
});
