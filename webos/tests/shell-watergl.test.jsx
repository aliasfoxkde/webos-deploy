// shell/watergl.js — the WebGL2 water engine — plus WaterWallpaper's
// mounted path, both driven through a recording WebGL2 context (the same
// trick the 2D FX tests use with makeCtx). The GL math itself is verified
// in a real browser (see docs/planning/webos-apps/QUALITY-PLAN.md); what
// happy-dom CAN pin is the engine's JS logic: buffer lifecycle, frame
// parity, the drop channel, rain scheduling, params swaps, disposal.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import createWaterEngine from '../src/shell/watergl.js';
import WaterWallpaper from '../src/shell/WaterWallpaper.jsx';
import { DEFAULTS } from '../src/os/waterfx.js';

/* ---- recording WebGL2 context ---- */
const makeGL = (opts = {}) => {
  const calls = [];
  const rec = (name) => (...args) => { calls.push([name, ...args]); };
  const recObj = (name) => (...args) => { const o = { obj: `${name}#${calls.length}` }; calls.push([name, ...args]); return o; };
  return {
    calls,
    // distinct tokens so uniform records are readable in assertions
    VERTEX_SHADER: 'vert', FRAGMENT_SHADER: 'frag', COMPILE_STATUS: 'compile',
    LINK_STATUS: 'link', TEXTURE_2D: 'tex2d', TEXTURE_MIN_FILTER: 'min-filter',
    TEXTURE_MAG_FILTER: 'mag-filter', LINEAR: 'linear', TEXTURE_WRAP_S: 'wrap-s',
    TEXTURE_WRAP_T: 'wrap-t', CLAMP_TO_EDGE: 'clamp', FRAMEBUFFER: 'fbo',
    COLOR_ATTACHMENT0: 'color0', TRIANGLES: 'tris', TEXTURE0: 'tex0', RGBA16F: 'rgba16f',
    getExtension: (name) => {
      calls.push(['getExtension', name]);
      if (name === 'EXT_color_buffer_float' || name === 'EXT_color_buffer_half_float') {
        return opts.noFloat ? null : {};
      }
      if (name === 'WEBGL_lose_context') return { loseContext: rec('loseContext') };
      return null;
    },
    createShader: recObj('createShader'), shaderSource: rec('shaderSource'),
    compileShader: rec('compileShader'),
    getShaderParameter: () => !opts.failCompile,
    getShaderInfoLog: () => 'compile boom',
    deleteShader: rec('deleteShader'),
    createProgram: recObj('createProgram'), attachShader: rec('attachShader'),
    detachShader: rec('detachShader'),
    linkProgram: rec('linkProgram'),
    getProgramParameter: () => !opts.failLink,
    getProgramInfoLog: () => 'link boom',
    deleteProgram: rec('deleteProgram'),
    getUniformLocation: (p, n) => ({ name: n }),
    createVertexArray: recObj('createVertexArray'), bindVertexArray: rec('bindVertexArray'),
    createTexture: recObj('createTexture'), bindTexture: rec('bindTexture'),
    texStorage2D: rec('texStorage2D'), texParameteri: rec('texParameteri'),
    createFramebuffer: recObj('createFramebuffer'), bindFramebuffer: rec('bindFramebuffer'),
    framebufferTexture2D: rec('framebufferTexture2D'),
    deleteTexture: rec('deleteTexture'), deleteFramebuffer: rec('deleteFramebuffer'),
    viewport: rec('viewport'), useProgram: rec('useProgram'),
    activeTexture: rec('activeTexture'), drawArrays: rec('drawArrays'),
    uniform1i: (loc, v) => calls.push(['uniform1i', loc.name, v]),
    uniform1f: (loc, v) => calls.push(['uniform1f', loc.name, v]),
    uniform2f: (loc, a, b) => calls.push(['uniform2f', loc.name, a, b]),
    uniform3f: (loc, a, b, c) => calls.push(['uniform3f', loc.name, a, b, c]),
    uniform3fv: (loc, v) => calls.push(['uniform3fv', loc.name, [...v]]),
  };
};

const makeCanvas = (gl) => {
  const c = document.createElement('canvas');
  Reflect.defineProperty(c, 'getContext', { value: () => gl, configurable: true });
  return c;
};
const allOf = (gl, name) => gl.calls.filter(([n]) => n === name);
// nth uniform record for a given uniform name (order of emission)
const uni = (gl, kind, name, nth = 0) =>
  allOf(gl, kind).filter(([, n]) => n === name)[nth];

describe('watergl engine', () => {
  it('refuses to build without WebGL2', () => {
    const canvas = document.createElement('canvas');
    Reflect.defineProperty(canvas, 'getContext', { value: () => null, configurable: true });
    expect(() => createWaterEngine(canvas, structuredClone(DEFAULTS))).toThrow(/WebGL2 unavailable/);
  });

  it('refuses to build without float render targets', () => {
    const gl = makeGL({ noFloat: true });
    expect(() => createWaterEngine(makeCanvas(gl), structuredClone(DEFAULTS)))
      .toThrow(/float render-target/);
  });

  it('surfaces shader compile and link failures', () => {
    expect(() => createWaterEngine(makeCanvas(makeGL({ failCompile: true })), structuredClone(DEFAULTS)))
      .toThrow(/shader compile failed/);
    expect(() => createWaterEngine(makeCanvas(makeGL({ failLink: true })), structuredClone(DEFAULTS)))
      .toThrow(/link failed/);
  });

  it('sizes sim buffers from the viewport and primes both targets', () => {
    const gl = makeGL();
    const canvas = makeCanvas(gl);
    const engine = createWaterEngine(canvas, structuredClone(DEFAULTS));
    const { frame, sw, sh } = engine.debug();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    expect(sw).toBe(Math.floor(vw * DEFAULTS.water.simScale));
    expect(sh).toBe(Math.floor(vh * DEFAULTS.water.simScale));
    expect(frame).toBe(1); // clearTargets ran the sim once into each buffer
    // two RGBA16F targets at sim resolution; canvas at output resolution
    expect(allOf(gl, 'texStorage2D')).toEqual([
      ['texStorage2D', gl.TEXTURE_2D, 1, gl.RGBA16F, sw, sh],
      ['texStorage2D', gl.TEXTURE_2D, 1, gl.RGBA16F, sw, sh],
    ]);
    expect(allOf(gl, 'drawArrays').length).toBe(2);
    expect(canvas.width).toBe(vw);
    expect(canvas.height).toBe(vh);
    engine.dispose();
  });

  it('steps the sim ping-pong and applies queued drops exactly once', () => {
    const gl = makeGL();
    const engine = createWaterEngine(makeCanvas(gl), structuredClone(DEFAULTS));
    const boundAtBuild = allOf(gl, 'bindFramebuffer').map(([, fbo]) => fbo);
    const fboA = boundAtBuild[0];
    const fboB = boundAtBuild[1]; // creation binds A then B

    engine.addDrop(0.5, 0.25);
    engine.step(0.016, 1);
    // the click drop went out on this frame...
    expect(uni(gl, 'uniform1f', 'drop', 2)).toEqual(['uniform1f', 'drop', 1]);
    expect(uni(gl, 'uniform2f', 'dropPos', 0)).toEqual(['uniform2f', 'dropPos', 0.5, 0.25]);
    // ...and the channel is single-shot on the next frame
    engine.step(0.016, 1);
    expect(uni(gl, 'uniform1f', 'drop', 3)).toEqual(['uniform1f', 'drop', 0]);

    // uTime reaches the output shader (regression: the static-output bug)
    expect(uni(gl, 'uniform1f', 'uTime', 0)).toBeTruthy();

    // ping-pong: frame 2 wrote B, frame 3 wrote A
    const simBinds = allOf(gl, 'bindFramebuffer').slice(boundAtBuild.length)
      .filter(([, fbo]) => fbo);
    expect(simBinds[0][1]).toBe(fboB);
    expect(simBinds[1][1]).toBe(fboA);
    expect(engine.debug().frame).toBe(3);
    engine.dispose();
  });

  it('pointer coords reach the sim; pointerOff parks the brush offscreen', () => {
    const gl = makeGL();
    const engine = createWaterEngine(makeCanvas(gl), structuredClone(DEFAULTS));
    engine.pointer(100, 50);
    engine.step(0.016, 1);
    expect(uni(gl, 'uniform2f', 'mouse', 2)).toEqual(['uniform2f', 'mouse', 100, 50]);
    engine.pointerOff();
    engine.step(0.016, 1);
    expect(uni(gl, 'uniform2f', 'mouse', 3)[2]).toBeLessThan(0);
    engine.dispose();
  });

  it('rain drops land the frame after they are scheduled; a click wins', () => {
    const params = structuredClone(DEFAULTS);
    params.water.rain = true;
    params.water.rainRate = 1000;
    const gl = makeGL();
    const engine = createWaterEngine(makeCanvas(gl), params);

    engine.step(0.1, 3); // carry 300 → clamped; the drop is queued, not drawn
    expect(uni(gl, 'uniform1f', 'drop', 2)).toEqual(['uniform1f', 'drop', 0]);
    engine.step(0.1, 3); // queued rain drop now renders
    expect(uni(gl, 'uniform1f', 'drop', 3)[2]).toBe(1);
    const [rx, ry] = uni(gl, 'uniform2f', 'dropPos', 0).slice(2);
    expect(rx).toBeGreaterThanOrEqual(0);
    expect(rx).toBeLessThanOrEqual(1);
    expect(ry).toBeGreaterThanOrEqual(0);
    expect(ry).toBeLessThanOrEqual(1);

    // an explicit click displaces the pending rain drop in the same channel
    engine.addDrop(0.2, 0.8);
    engine.step(0.1, 3);
    expect(uni(gl, 'uniform2f', 'dropPos', 1)).toEqual(['uniform2f', 'dropPos', 0.2, 0.8]);
    engine.dispose();
  });

  it('drawStatic paints a frame without advancing time', () => {
    const gl = makeGL();
    const engine = createWaterEngine(makeCanvas(gl), structuredClone(DEFAULTS));
    const { time, frame } = engine.debug();
    engine.drawStatic();
    expect(engine.debug().time).toBe(time);
    expect(engine.debug().frame).toBe(frame + 1);
    engine.dispose();
  });

  it('setParams recreates buffers only when sim resolution changes', () => {
    const gl = makeGL();
    const engine = createWaterEngine(makeCanvas(gl), structuredClone(DEFAULTS));
    expect(allOf(gl, 'texStorage2D').length).toBe(2);

    const tweak = structuredClone(DEFAULTS);
    tweak.optics.distortion = 0.9;
    engine.setParams(tweak);
    expect(allOf(gl, 'texStorage2D').length).toBe(2); // uniform-only change
    engine.step(0.016, 1);
    const dist = uni(gl, 'uniform1f', 'uDistortion', 0);
    expect(dist[2]).toBeCloseTo(0.9); // applied live, no recompile

    const rescaled = structuredClone(tweak);
    rescaled.water.simScale = 0.25;
    engine.setParams(rescaled);
    expect(allOf(gl, 'texStorage2D').length).toBe(4); // buffers rebuilt
    expect(engine.debug().sw).toBe(Math.floor(window.innerWidth * 0.25));
    expect(engine.debug().frame).toBe(1); // freshly primed
    engine.dispose();
  });

  it('dispose releases every GL object and loses the context', () => {
    const gl = makeGL();
    const engine = createWaterEngine(makeCanvas(gl), structuredClone(DEFAULTS));
    engine.dispose();
    expect(allOf(gl, 'deleteTexture').length).toBe(2);
    expect(allOf(gl, 'deleteFramebuffer').length).toBe(2);
    expect(allOf(gl, 'deleteProgram').length).toBe(2);
    expect(allOf(gl, 'deleteShader').length).toBe(4); // 2 verts + 2 frags
    expect(allOf(gl, 'loseContext').length).toBe(1);
  });
});

describe('WaterWallpaper (WebGL2 available)', () => {
  let gl;
  const rafCalls = [];

  beforeEach(() => {
    localStorage.clear();
    cleanup();
    gl = makeGL();
    Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: vi.fn(() => gl), configurable: true, writable: true,
    });
    rafCalls.length = 0;
    vi.stubGlobal('requestAnimationFrame', (cb) => { rafCalls.push(cb); return 1 + rafCalls.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts the real engine, arms the loop, and bridges window input', () => {
    const c = render(<WaterWallpaper id="water-fx" />);
    const canvas = c.container.querySelector('#water-fx');
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(rafCalls.length).toBe(1); // animation loop armed, no fallback swap

    // pointer move bridges screen → sim coords (y flipped, × simScale)
    fireEvent.pointerMove(window, { clientX: 100, clientY: 50 });
    act(() => { rafCalls[rafCalls.length - 1](16); });
    const ih = window.innerHeight;
    expect(uni(gl, 'uniform2f', 'mouse', 2)).toEqual(
      ['uniform2f', 'mouse', 50, (ih - 50) / 2],
    );

    // click → queued drop, consumed on the next frame
    fireEvent.pointerDown(window, { clientX: 10, clientY: 20 });
    act(() => { rafCalls[rafCalls.length - 1](32); });
    expect(uni(gl, 'uniform1f', 'drop', 3)[2]).toBe(1);

    // window resize rebuilds the buffers
    const before = allOf(gl, 'texStorage2D').length;
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(allOf(gl, 'texStorage2D').length).toBe(before + 2);
  });

  it('live param updates reach the engine in place (no remount, no rebuild)', () => {
    const c = render(<WaterWallpaper id="water-fx" params={structuredClone(DEFAULTS)} />);
    act(() => { rafCalls[rafCalls.length - 1](16); });
    const stored = allOf(gl, 'texStorage2D').length;
    const canvasEl = c.container.querySelector('#water-fx');

    const tuned = structuredClone(DEFAULTS);
    tuned.optics.distortion = 0.9;
    c.rerender(<WaterWallpaper id="water-fx" params={tuned} />);
    act(() => { rafCalls[rafCalls.length - 1](16); });
    const dist = [...allOf(gl, 'uniform1f')].reverse().find(([, n]) => n === 'uDistortion');
    expect(dist[2]).toBeCloseTo(0.9);
    expect(allOf(gl, 'texStorage2D').length).toBe(stored); // uniform-only

    // a sim-scale change DOES rebuild — in place, same mounted engine
    const rescaled = structuredClone(tuned);
    rescaled.water.simScale = 0.25;
    c.rerender(<WaterWallpaper id="water-fx" params={rescaled} />);
    expect(allOf(gl, 'texStorage2D').length).toBe(stored + 2);
    expect(c.container.querySelector('#water-fx')).toBe(canvasEl); // same mount
  });

  it('re-arms on visibility change and disposes on unmount', () => {
    const c = render(<WaterWallpaper id="water-fx" />);
    const armed = rafCalls.length;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    });
    expect(rafCalls.length).toBe(armed + 1); // visible → re-armed once more
    c.unmount();
    expect(allOf(gl, 'loseContext').length).toBe(1);
    expect(rafCalls.length).toBe(armed + 1); // loop not re-armed after unmount
  });
});
