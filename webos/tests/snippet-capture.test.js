import { describe, it, expect } from 'vitest';
import { rectFromDrag, isRectMeaningful, cropSourceRect, timestampName } from '../src/apps/snippet/capture.js';

describe('rectFromDrag', () => {
  it('normalizes a positive drag', () => {
    expect(rectFromDrag(10, 10, 50, 40)).toEqual({ x: 10, y: 10, w: 40, h: 30 });
  });
  it('flips a negative (up-left) drag', () => {
    expect(rectFromDrag(50, 40, 10, 10)).toEqual({ x: 10, y: 10, w: 40, h: 30 });
  });
  it('handles zero-size drags', () => {
    expect(rectFromDrag(5, 5, 5, 5)).toEqual({ x: 5, y: 5, w: 0, h: 0 });
  });
});

describe('isRectMeaningful', () => {
  it('rejects tiny selections', () => {
    expect(isRectMeaningful({ w: 3, h: 100 })).toBe(false);
    expect(isRectMeaningful({ w: 100, h: 3 })).toBe(false);
  });
  it('accepts real selections at the default threshold', () => {
    expect(isRectMeaningful({ w: 4, h: 4 })).toBe(true);
  });
  it('honours a custom minimum', () => {
    expect(isRectMeaningful({ w: 8, h: 8 }, 10)).toBe(false);
  });
});

describe('cropSourceRect', () => {
  const viewport = { w: 1000, h: 500 };
  const source = { w: 2000, h: 1000 }; // exact 2x, no letterbox

  it('scales a viewport rect onto the source', () => {
    expect(cropSourceRect({ x: 100, y: 50, w: 200, h: 100 }, viewport, source))
      .toEqual({ x: 200, y: 100, w: 400, h: 200 });
  });

  it('returns null for degenerate inputs', () => {
    expect(cropSourceRect({ x: 0, y: 0, w: 5, h: 5 }, { w: 0, h: 500 }, source)).toBeNull();
    expect(cropSourceRect({ x: 0, y: 0, w: 5, h: 5 }, viewport, { w: 0, h: 0 })).toBeNull();
  });

  it('accounts for letterbox offsets (wide source in a tall viewport)', () => {
    const vp = { w: 1000, h: 1000 };
    const src = { w: 2000, h: 1000 }; // scale 2, shown 1000x500, offY 250
    expect(cropSourceRect({ x: 0, y: 250, w: 100, h: 50 }, vp, src))
      .toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });

  it('clips selections outside the frame', () => {
    const r = cropSourceRect({ x: -50, y: 0, w: 100, h: 100 }, viewport, source);
    expect(r.x).toBe(0);
  });

  it('returns null when the selection misses the frame entirely', () => {
    expect(cropSourceRect({ x: 5000, y: 5000, w: 10, h: 10 }, viewport, source)).toBeNull();
  });
});

describe('timestampName', () => {
  it('produces a prefixed png name with zero-padded date', () => {
    const name = timestampName('snip');
    expect(name).toMatch(/^snip-\d{8}-\d{6}\.png$/);
  });
  it('defaults to the snippet prefix', () => {
    expect(timestampName()).toMatch(/^snippet-/);
  });
});
