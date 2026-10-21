// Branch coverage for lens.js and LensFilters.jsx.
// lens.test.js covers the happy paths; lens-filters.test.jsx covers the
// glass-persona wiring. This file targets the uncovered branches:
// - edgeNormal: the || 1 short-circuit fires when the argument is 0
//   (point sits exactly at the horizontal or vertical centre of the slab)
// - LensFilters: the if(surfaceEl(LENS_MENU_ID)) guard is false when
//   the start menu is absent on first mount
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { OSProvider } from '../src/os/state.jsx';
import LensFiltersUnderTest from '../src/os/LensFilters.jsx';

// --- edgeNormal: hit the || 1 short-circuit branches ---
// Math.sign(expr || 1): when expr is 0, the || 1 evaluates to 1 and the
// sign call fires with 1 instead of 0.  The branch is taken because
// expr is falsy, even though the resulting value happens to be the same
// as what Math.sign(0) would have returned.

describe('edgeNormal short-circuit branches', () => {
  it('sign(x-w/2 || 1) short-circuit fires when x equals the slab horizontal centre', async () => {
    const { edgeNormal } = await import('../src/os/lens.js');
    // w=100, h=30, r=10 → hx=40, hy=5
    // x=50 → x-w/2=0 → ||1 fires, sign receives 1
    // qx = |50-50|-40 = -40 < 0; qy = |8-15|-5 = 2 > 0 (wait, 8 is above centre)
    // Actually: y=8, h/2=15 → |8-15|=7, 7-5=2 > 0
    // So qx<0, qy>0 → else branch: nx=0, ny=sign(8-15||1)=sign(-7)=-1
    const [nx, ny] = edgeNormal(50, 8, 100, 30, 10);
    expect(nx).toBe(0);  // qx<0 → nx=0 (||1 fires inside sign(50-50||1)=sign(1)=1, but qx negative so nx stays 0)
    expect(ny).toBe(-1); // qy>0 but we take else branch (qx<0): ny=sign(8-15)=-1
  });

  it('sign(y-h/2 || 1) short-circuit fires when y equals the slab vertical centre', async () => {
    const { edgeNormal } = await import('../src/os/lens.js');
    // Find a point on the slab boundary where y exactly equals h/2 (15)
    // and qx<=0 so the else branch fires (ny = sign(0||1) = 1)
    // w=100, h=30, r=10 → hx=40, hy=5
    // For the else branch: qx<=0 and qy<=0
    // y=15 → |0|-5 = -5 (qy=-5, good)
    // x=70 → |70-50|-40 = 20-40 = -20 (qx=-20, good, to the right of centre)
    // → else branch: nx=0, ny=sign(15-15||1)=sign(1)=1
    const [nx, ny] = edgeNormal(70, 15, 100, 30, 10);
    expect(nx).toBe(0);  // qx<0 → else: nx=0
    expect(ny).toBe(1);  // qy<0 → else: ny=sign(0||1)=1 (upward, but because of ||1)
  });

  it('sign||1 and hypot||1 both fire at the true geometric centre', async () => {
    const { edgeNormal } = await import('../src/os/lens.js');
    // At the true centre: x=w/2=50, y=h/2=15
    // qx = |0|-40 = -40; qy = |0|-5 = -5 → else branch fires
    // nx = 0; ny = sign(15-15||1) = sign(1) = 1
    const [nx, ny] = edgeNormal(50, 15, 100, 30, 10);
    expect(nx).toBe(0);
    expect(ny).toBe(1);
  });
});

// --- LensFilters: if(surfaceEl(LENS_MENU_ID)) guard is false on first mount ---

const ctx2d = () => new Proxy({}, {
  get(_, prop) { return prop === 'canvas' ? undefined : () => {}; },
  set() { return true; },
});

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb) { this.cb = cb; }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  if (!window.ImageData) {
    window.ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 2000, right: 800, bottom: 2040, width: 800, height: 40,
  });
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: (type) => (type === '2d' ? ctx2d() : null), configurable: true, writable: true,
  });
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    value: () => 'data:image/png;base64,AAA', configurable: true, writable: true,
  });
  // Only #taskbar is in the DOM — #start-menu is absent
  document.body.innerHTML = '<div id="taskbar"></div>';
});

afterEach(() => {
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'getContext');
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'toDataURL');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  delete document.body.dataset.lens;
  cleanup();
});

describe('LensFilters uncovered branches', () => {
  it('if(surfaceEl(LENS_MENU_ID)) guard is false when the start menu is absent', async () => {
    // #start-menu is not in the DOM, so surfaceEl(LENS_MENU_ID) returns null.
    // The guard at line 74 evaluates to false, so menuRo = attach(LENS_MENU_ID)
    // is NOT executed — the true branch is the uncovered branch.
    // We verify the component only builds the taskbar filter (not the menu one).
    vi.stubGlobal('CSS', { supports: () => true });
    localStorage.setItem('webos.persona', JSON.stringify('win'));
    render(<OSProvider><LensFiltersUnderTest /></OSProvider>);
    await act(async () => {});

    // Only the taskbar filter is registered — the menu guard never fired
    const filters = document.querySelectorAll('svg defs filter');
    expect(filters.length).toBe(1);
    expect(filters[0].id).toBe('lens-tb');

    vi.unstubAllGlobals();
  });
});
