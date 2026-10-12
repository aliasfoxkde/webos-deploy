// PlotCanvas.jsx — the graphing plotter, against a recording fake 2d context.
// Asserts what the draw pass actually does: grid/axis strokes, tick labels,
// curve sampling with NaN gaps, hover-trace readout, zoom/pan/reset wiring.
//
// Geometry notes (dbg-verified against the real draw pass): at the 200×100
// reset view the step is 10 and the only tick in view is 0 — which the plotter
// deliberately leaves unlabeled — so `labels()` is legitimately empty until
// the view zooms. Zoom-in once at that size drops the step to 2 → ['-2','2'].
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import PlotCanvas from '../src/apps/calculator/graph/PlotCanvas.jsx';

// happy-dom has no canvas 2d context — a recording Proxy stands in.
const calls = [];
const ctx = new Proxy({}, {
  get(_, prop) {
    if (prop === 'canvas') return undefined;
    return (...args) => calls.push([prop, args]);
  },
  set(_, prop, value) { calls.push([`set:${String(prop)}`, value]); return true; },
});
const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);

// happy-dom layout gives everything zero size; pin plot wraps by element.
let sizes = new Map();
const pinSize = (el, w, h) => sizes.set(el, [w, h]);
for (const prop of ['clientWidth', 'clientHeight']) {
  Object.defineProperty(window.HTMLElement.prototype, prop, {
    configurable: true,
    get() { return sizes.get(this)?.[prop === 'clientWidth' ? 0 : 1] ?? 0; },
  });
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (!window.Element.prototype.setPointerCapture) {
  window.Element.prototype.setPointerCapture = () => {};
  window.Element.prototype.releasePointerCapture = () => {};
}

// happy-dom's WheelEvent preserves deltaY but drops clientX/clientY — patch them.
const wheelAt = (el, deltaY, x, y) => {
  const ev = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true });
  Object.defineProperty(ev, 'clientX', { value: x });
  Object.defineProperty(ev, 'clientY', { value: y });
  act(() => { el.dispatchEvent(ev); });
  return ev;
};

const fire = (el, type, props = {}) =>
  act(() => { el.dispatchEvent(new PointerEvent(type, { bubbles: true, ...props })); });
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const labels = () => calls.filter((c) => c[0] === 'fillText').map((c) => c[1][0]);

beforeEach(() => { calls.length = 0; sizes = new Map(); });
afterEach(() => { cleanup(); });

const render2 = () => {
  const fns = [{ expr: 'x^2', fn: (x) => x * x, error: null }];
  const utils = render(<PlotCanvas fns={fns} colors={['#ff0044']} />);
  return { ...utils, wrap: utils.container.querySelector('.plot-wrap') };
};

describe('draw pass', () => {
  it('sizes the canvas, strokes grid+axes, labels ticks, samples the curve', () => {
    const { wrap } = render2();
    pinSize(wrap, 800, 500);
    fire(wrap, 'pointermove', { clientX: 400, clientY: 250 }); // trace change forces the redraw
    const names = calls.map((c) => c[0]);
    expect(calls.find((c) => c[0] === 'clearRect')[1]).toEqual([0, 0, 800, 500]);
    expect(calls.find((c) => c[0] === 'setTransform')[1]).toEqual([1, 0, 0, 1, 0, 0]); // dpr 1
    expect(names.filter((n) => n === 'lineTo').length).toBeGreaterThan(100); // grid + ~400 curve samples
    expect(names).toContain('arc'); // the hover-trace dot
    // ±16 units in view at step 10 → nonzero ticks -10/10 get labels; 0 does not
    expect(labels()).toEqual(expect.arrayContaining(['-10', '10']));
    expect(labels()).not.toContain('0');
  });

  it('skips non-finite samples: a NaN function draws grid but no curve', () => {
    const counts = [];
    for (const fn of [(x) => x * x, () => NaN]) {
      const { container } = render(
        <PlotCanvas fns={[{ expr: 'f', fn, error: null }]} colors={['#fff']} />,
      );
      const wrap = container.querySelector('.plot-wrap');
      pinSize(wrap, 800, 500);
      fire(wrap, 'pointermove', { clientX: 400, clientY: 250 });
      counts.push(calls.filter((c) => c[0] === 'lineTo').length); // grid+axes+trace vs +curve
      cleanup();
      calls.length = 0;
    }
    expect(counts[0]).toBeGreaterThan(100); // the real curve is sampled
    expect(counts[1]).toBeLessThan(counts[0] / 10); // NaN fn: grid+axes only
  });

  it('an erroring function (fn=null) is skipped in draw and trace', () => {
    const { container } = render(
      <PlotCanvas fns={[{ expr: 'x/0', fn: null, error: 'Division by zero' }]} colors={['#fff']} />,
    );
    const wrap = container.querySelector('.plot-wrap');
    pinSize(wrap, 200, 100);
    fire(wrap, 'pointermove', { clientX: 100, clientY: 50 });
    expect(calls.map((c) => c[0])).not.toContain('arc');
    expect(wrap.querySelector('.plot-trace')).toBeNull(); // no readout row for a dead fn
  });
});

describe('interactions', () => {
  it('hover shows the trace readout; leaving hides it', () => {
    const { wrap } = render2();
    pinSize(wrap, 200, 100);
    fire(wrap, 'pointermove', { clientX: 100, clientY: 50 });
    const trace = wrap.querySelector('.plot-trace');
    expect(trace).toBeTruthy();
    // dead center of the reset view: x = 4 in math units (0-width probe rect),
    // and the x² row reads 16 — textContent concatenates dim + row
    expect(trace.textContent).toContain('x = 4');
    expect(trace.textContent).toContain('16');
    fireEvent.pointerLeave(wrap); // RTL maps leave → pointerout for React's synthetic events
    expect(wrap.querySelector('.plot-trace')).toBeNull();
  });

  it('drag pans the view: the panned origin survives into the next redraw', () => {
    const { wrap } = render2();
    pinSize(wrap, 200, 100);
    fire(wrap, 'pointerdown', { clientX: 150, clientY: 50 });
    fire(wrap, 'pointermove', { clientX: 10, clientY: 50 }); // dx = -140 → view.x = 5.6
    calls.length = 0;
    click(wrap.querySelector('button[title="Zoom in"]')); // step drops to 2 → ticks re-space
    expect(labels()).toEqual(['4', '6', '8']); // panned center — no negative ticks
    fire(wrap, 'pointerup');
  });

  it('zoom buttons rescale; double-click resets the view', () => {
    const { wrap } = render2();
    pinSize(wrap, 200, 100);
    fire(wrap, 'pointermove', { clientX: 100, clientY: 50 }); // prime a draw
    expect(labels()).toEqual([]); // reset view: only the unlabeled 0 tick
    click(wrap.querySelector('button[title="Zoom in"]'));
    expect(labels()).toEqual(['-2', '2']); // step drops 5 → 2
    click(wrap.querySelector('button[title="Zoom in"]'));
    calls.length = 0; // labels() reads the draw buffer — reset between phases
    click(wrap.querySelector('button[title="Zoom in"]'));
    click(wrap.querySelector('button[title="Zoom in"]'));
    expect(labels()).toContain('-1'); // deep enough that the ladder reaches step 1
    calls.length = 0;
    click(wrap.querySelector('button[title="Zoom out"]'));
    expect(labels().length).toBeGreaterThan(0); // − redraws; the wheel test pins exact rescaling
    calls.length = 0;
    click(wrap.querySelector('button[title="Reset view"]')); // ⌂ returns to the default
    expect(labels()).toEqual([]); // reset view: only the unlabeled 0 tick
    calls.length = 0;
    act(() => { wrap.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(labels()).toEqual([]); // double-click reset is idempotent
  });

  it('wheel zooms about the cursor without navigating', () => {
    const { wrap } = render2();
    pinSize(wrap, 200, 100);
    fire(wrap, 'pointermove', { clientX: 100, clientY: 50 });
    expect(labels()).toEqual([]);
    const ev = wheelAt(wrap, -120, 100, 50); // zoom in
    expect(ev.defaultPrevented).toBe(true); // page scroll suppressed
    expect(labels()).not.toEqual([]); // scale changed → ticks re-spaced into view
    calls.length = 0;
    wheelAt(wrap, 120, 100, 50); // zoom back out to ~reset
    expect(labels()).toEqual([]);
  });
});

describe('tick formatting (via fillText)', () => {
  it('deep zoom-ins render exponential tick labels', () => {
    const { wrap } = render2();
    pinSize(wrap, 200, 100);
    // zoom in until a labeled tick drops below 1e-3 (fmtTick switches to
    // exponential; zoom-out caps at scale 1, which never gets there)
    let found = null;
    for (let i = 0; i < 40 && !found; i++) {
      click(wrap.querySelector('button[title="Zoom in"]'));
      found = labels().find((l) => l.includes('e'));
    }
    expect(found).toBeTruthy();
  });
});

afterAll(() => { getContext.mockRestore(); });
