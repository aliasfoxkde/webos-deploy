// Settings → Screen saver: the live mini-preview. It must render the SAME
// implementations as the fullscreen saver (no preview copies), stay animated
// (gentle mode — reduced motion slows, never freezes), respect kind changes,
// and tear every timer/loop down on unmount.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';
import SaverPreview from '../src/shell/SaverPreview.jsx';
import { WALLPAPERS } from '../src/os/wallpapers.js';

let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};
const mount = () => render(<OSProvider><Probe /><SaverPreview /></OSProvider>);

let ctx2d;
const rafCalls = [];
const cancelSpy = vi.fn();
const makeCtx = () => {
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    setTransform: rec('setTransform'), fillRect: rec('fillRect'),
    beginPath: rec('beginPath'), arc: rec('arc'), fill: rec('fill'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), stroke: rec('stroke'),
    closePath: rec('closePath'), fillText: rec('fillText'),
    createLinearGradient: () => ({ addColorStop: rec('addColorStop') }),
  };
};

beforeEach(() => {
  localStorage.clear();
  cleanup();
  cancelSpy.mockClear();
  ctx2d = makeCtx();
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ctx2d, configurable: true, writable: true,
  });
  rafCalls.length = 0;
  vi.stubGlobal('requestAnimationFrame', (cb) => { rafCalls.push(cb); return 1 + rafCalls.length; });
  vi.stubGlobal('cancelAnimationFrame', cancelSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SaverPreview', () => {
  it('shows an off state, and FX kinds animate in the box', () => {
    const c = mount();
    act(() => cur.setSaver({ kind: 'off' }));
    expect(c.container.textContent).toContain('Screen saver is off');

    act(() => cur.setSaver({ kind: 'starfield' }));
    const canvas = c.container.querySelector('canvas#saver-preview-fx');
    expect(canvas).toBeTruthy();
    expect(c.container.querySelector('.saver-preview').getAttribute('aria-label'))
      .toBe('Screen saver preview: starfield');
    expect(rafCalls.length).toBeGreaterThan(0); // loop armed despite any motion pref
    act(() => { rafCalls[rafCalls.length - 1](16); });
    expect(ctx2d.calls.some(([n]) => n === 'fillRect')).toBe(true); // it drew
  });

  it('the water kind falls back honestly to the 2D canvas without WebGL2', () => {
    const c = mount();
    act(() => cur.setSaver({ kind: 'water', speed: 2 }));
    // no WebGL2 under happy-dom → the documented 2D fallback canvas
    expect(c.container.querySelector('canvas#saver-preview-fx')).toBeTruthy();
    const armed = rafCalls.length;
    expect(armed).toBeGreaterThan(0);
  });

  it('photo and clock kinds render their real implementations', () => {
    const c = mount();
    const photos = WALLPAPERS.filter((w) => w.img);
    act(() => cur.setSaver({ kind: 'photos', photoSecs: 8 }));
    expect(c.container.querySelector('.saver-photo').style.backgroundImage)
      .toContain(photos[0].img);
    act(() => cur.setSaver({ kind: 'clock' }));
    expect(c.container.querySelector('.saver-time').textContent).toMatch(/\d{1,2}:\d{2}/);
    expect(c.container.querySelector('.saver-date').textContent.length).toBeGreaterThan(4);
  });

  it('kind switches swap the preview in place; unmount cancels every loop', () => {
    const c = mount();
    act(() => cur.setSaver({ kind: 'aurora' }));
    const armedAurora = rafCalls.length;
    expect(armedAurora).toBeGreaterThan(0);
    act(() => cur.setSaver({ kind: 'off' }));
    expect(c.container.querySelector('canvas')).toBeNull();
    expect(rafCalls.length).toBe(armedAurora); // no re-arm after the switch
    c.unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });
});
