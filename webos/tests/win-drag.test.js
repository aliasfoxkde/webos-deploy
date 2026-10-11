// winDrag.startMoveDrag: pointer-follow clamps, tear-off of tiled/maximized
// windows (pre-restore keeps the grab fraction), and drop-zone dispatch.
// The OS surface is a stub — the unit under test is the drag controller.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startMoveDrag } from '../src/shell/winDrag.js';

const pe = (type, x, y) => new PointerEvent(type, { clientX: x, clientY: y, bubbles: true });

let os;
beforeEach(() => {
  os = { setRect: vi.fn(), snap: vi.fn(), toggleMax: vi.fn() };
  window.dispatchEvent(pe('pointerup', 0, 0)); // kill any leaked drag
});

const drag = (win, osArg = os, onHint) => startMoveDrag(pe('pointerdown', 100, 100), win, osArg, onHint);

describe('floating windows', () => {
  it('follows the pointer 1:1 and reports zones via onHint', () => {
    const win = { id: 1, rect: { x: 80, y: 80, w: 400, h: 300 } };
    const onHint = vi.fn();
    drag(win, os, onHint);
    window.dispatchEvent(pe('pointermove', 140, 90));
    expect(os.setRect).toHaveBeenCalledWith(1, { x: 120, y: 70, w: 400, h: 300 });
    expect(onHint).toHaveBeenLastCalledWith(null); // 140,90 is mid-screen
    window.dispatchEvent(pe('pointerup', 140, 90));
    expect(onHint).toHaveBeenLastCalledWith(null);
  });

  it('clamps: never fully off-screen left, never below the viewport', () => {
    const win = { id: 1, rect: { x: 80, y: 80, w: 400, h: 300 } };
    drag(win);
    // drag far left: x >= -w + 90
    window.dispatchEvent(pe('pointermove', -1000, 100));
    expect(os.setRect.mock.lastCall[1].x).toBe(-400 + 90);
    // drag far down: y <= innerHeight - 100
    window.dispatchEvent(pe('pointermove', 100, 100000));
    expect(os.setRect.mock.lastCall[1].y).toBe(window.innerHeight - 100);
    // drag far up: y >= 0
    window.dispatchEvent(pe('pointermove', 100, -1000));
    expect(os.setRect.mock.lastCall[1].y).toBe(0);
  });

  it('drop on a side zone snaps; plain drop clears the hint', () => {
    const win = { id: 1, rect: { x: 80, y: 80, w: 400, h: 300 } };
    const onHint = vi.fn();
    drag(win, os, onHint);
    window.dispatchEvent(pe('pointermove', 2, 300)); // left edge zone
    expect(onHint).toHaveBeenLastCalledWith(expect.stringMatching(/left/));
    window.dispatchEvent(pe('pointerup', 2, 300));
    expect(os.snap).toHaveBeenCalledWith(1, expect.stringMatching(/left/));
    expect(os.toggleMax).not.toHaveBeenCalled();
  });
});

describe('tear-off', () => {
  it('a tiled window tears off at its pre size, grab fraction preserved', () => {
    const win = {
      id: 2, snap: 'left',
      rect: { x: 0, y: 0, w: 400, h: 300 }, // current (tiled) rect
      pre: { x: 200, y: 150, w: 800, h: 600 },
    };
    drag(win);
    // grab point 100 is 20% into the 400px tiled rect; the pre-restore puts
    // the same fraction of the 800px pre under the pointer: 140 - 0.2*800.
    window.dispatchEvent(pe('pointermove', 140, 120));
    const r = os.setRect.mock.lastCall[1];
    expect(r.w).toBe(800);
    expect(r.h).toBe(600);
    expect(r.x).toBe(140 - 160);
    expect(os.toggleMax).not.toHaveBeenCalled();
  });

  it('a maximized window tears off and untoggles max exactly once', () => {
    const win = { id: 3, max: true, rect: { x: 0, y: 0, w: 1520, h: 800 } };
    drag(win);
    window.dispatchEvent(pe('pointermove', 300, 200));
    window.dispatchEvent(pe('pointermove', 320, 220)); // second move: no re-tear
    expect(os.toggleMax).toHaveBeenCalledTimes(1);
    const r = os.setRect.mock.lastCall[1];
    expect(r.w).toBe(1520);
  });

  it('tear-off without a pre falls back to the drag-start rect', () => {
    const win = { id: 4, max: true, rect: { x: 0, y: 0, w: 1520, h: 800 } };
    drag(win);
    window.dispatchEvent(pe('pointermove', 60, 40));
    const r = os.setRect.mock.lastCall[1];
    expect(r.w).toBe(1520);
    // grab at y=100 on a rect whose top is 0 → the window rides 78px above
    // the pointer, clamped at the viewport top: max(0, 40 - 78).
    expect(r.y).toBe(0);
  });
});

describe('drop zones', () => {
  it('drop on the top edge maximizes', () => {
    const win = { id: 5, rect: { x: 80, y: 80, w: 400, h: 300 } };
    drag(win);
    window.dispatchEvent(pe('pointermove', 700, 2));
    window.dispatchEvent(pe('pointerup', 700, 2));
    expect(os.toggleMax).toHaveBeenCalledWith(5);
    expect(os.snap).not.toHaveBeenCalled();
  });
});
