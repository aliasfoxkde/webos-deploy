// LensFilters component: the debounced displacement-map rebuild. lens.js math
// is covered in lens.test.js; this drives the component wiring — the filter
// defs engage only for glass personas on SVG-capable engines, and a
// ResizeObserver tick rebuilds (debounced 150 ms) instead of rebuilding per
// event. lens.js is partly stubbed so the debounce path runs in happy-dom.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { OSProvider } from '../src/os/state.jsx';
import LensFiltersUnderTest from '../src/os/LensFilters.jsx';

vi.mock('../src/os/lens.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, lensSupported: () => true }; // pretend the engine has SVG filters
});

const observers = [];
class RecordingRO {
  constructor(cb) { this.cb = cb; observers.push(this); }
  observe() {}
  unobserve() {}
  disconnect() { observers.splice(observers.indexOf(this), 1); }
}

const ctx2d = () => new Proxy({}, {
  get(_, prop) { return prop === 'canvas' ? undefined : () => {}; },
  set() { return true; },
});

beforeEach(() => {
  localStorage.clear();
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', RecordingRO);
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

const mount = (persona) => {
  localStorage.setItem('webos.persona', JSON.stringify(persona));
  return render(<OSProvider><LensFiltersUnderTest /></OSProvider>);
};

describe('LensFilters', () => {
  it('builds a map, engages body[data-lens], and debounces resize rebuilds', async () => {
    mount('win');
    await act(async () => {}); // initial attach + build ran
    expect(document.body.dataset.lens).toBe('on'); // a filter carries a map
    expect(document.querySelector('svg defs filter')).toBeTruthy();

    const ro = observers[observers.length - 1];
    expect(ro).toBeTruthy();
    act(() => { ro.cb(); }); // resize event — must NOT rebuild immediately
    expect(document.querySelectorAll('svg defs filter').length).toBe(1);
    await act(async () => { await new Promise((r) => setTimeout(r, 170)); }); // past the debounce
    expect(document.body.dataset.lens).toBe('on'); // rebuild ran, state stays consistent
  });

  it('non-glass personas never engage the filters', () => {
    mount('linux');
    expect(document.body.dataset.lens).toBeUndefined();
    expect(document.querySelector('svg defs filter')).toBeNull();
  });
});
