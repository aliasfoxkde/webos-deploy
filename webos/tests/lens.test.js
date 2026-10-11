// Lens displacement-map math (LG4 refraction). The module is pure so the
// geometry is testable without a browser: sign conventions, band neutrality,
// profile shape, and the stable ids CSS references.
import { describe, it, expect } from 'vitest';
import {
  LENS_BAND, LENS_MAX_DISP, LENS_TB_ID, LENS_MENU_ID,
  lensProfile, edgeDistance, edgeNormal, lensMap, lensScale, lensKey,
  lensCss, lensSupported,
} from '../src/os/lens.js';

const channel = (map, x, y, c) => map.data[(y * map.width + x) * 4 + c];

describe('lens profile + geometry', () => {
  it('profile is 0 at the edge, 1 at band depth, monotonic in between', () => {
    expect(lensProfile(0)).toBe(0);
    expect(lensProfile(1)).toBeCloseTo(1, 12);
    for (let i = 1; i < 10; i++) {
      expect(lensProfile(i / 10)).toBeGreaterThan(lensProfile((i - 1) / 10));
    }
  });

  it('edgeDistance is negative inside, ~0 on the edge, positive outside', () => {
    // 200×80 slab, corner radius 10 — the interior is 40px deep, past the band
    expect(edgeDistance(100, 40, 200, 80, 10)).toBeLessThan(-LENS_BAND); // deep interior
    expect(Math.abs(edgeDistance(0.5, 40, 200, 80, 10))).toBeLessThan(1); // left edge
    expect(edgeDistance(-5, 40, 200, 80, 10)).toBeGreaterThan(0); // outside
    // corner: point on the boundary arc — the quarter of the r=10 circle
    // centered at (10,10) that faces the slab corner at (0,0)
    expect(Math.abs(edgeDistance(10 - 10 / Math.SQRT2, 10 - 10 / Math.SQRT2, 200, 80, 10))).toBeLessThan(0.01);
  });

  it('edgeNormal is axis-aligned mid-edge and radial in corner sectors', () => {
    expect(edgeNormal(0.5, 30, 100, 60, 10)).toEqual([-1, 0]); // left edge → outward -x
    expect(edgeNormal(50, 0.5, 100, 60, 10)).toEqual([0, -1]); // top edge → outward -y
    const [cx, cy] = edgeNormal(2, 2, 100, 60, 10); // top-left corner sector
    expect(cx).toBeLessThan(0);
    expect(cy).toBeLessThan(0);
    // unit length in the corner sector
    expect(Math.hypot(cx, cy)).toBeCloseTo(1, 12);
  });
});

describe('lensMap', () => {
  it('keeps the interior exactly neutral (128,128)', () => {
    const m = lensMap(200, 80, 12);
    const cx = 100; const cy = 40; // deep inside, beyond the band
    expect(channel(m, cx, cy, 0)).toBe(128);
    expect(channel(m, cx, cy, 1)).toBe(128);
    expect(channel(m, cx, cy, 3)).toBe(255);
  });

  it('displaces inward: top edge pulls +y, left edge pulls +x', () => {
    const m = lensMap(200, 80, 12);
    // a pixel just inside the top edge, far from corners
    const gx = channel(m, 100, 2, 1);
    expect(gx).toBeGreaterThan(128); // inward (+y) displacement
    const rx = channel(m, 2, 40, 0);
    expect(rx).toBeGreaterThan(128); // inward (+x) displacement
    // the orthogonal channel stays neutral on a straight edge
    expect(channel(m, 100, 2, 0)).toBe(128);
    expect(channel(m, 2, 40, 1)).toBe(128);
  });

  it('displacement grows from the band edge toward the slab edge', () => {
    const m = lensMap(200, 80, 12);
    const near = channel(m, 100, LENS_BAND - 4, 1); // close to band depth
    const nearer = channel(m, 100, 4, 1); // close to the physical edge
    expect(nearer - 128).toBeGreaterThan(near - 128);
  });

  it('corner pixels displace on both channels', () => {
    const m = lensMap(200, 80, 12);
    // just inside the rounded corner (the corner square beyond the arc is
    // clipped by border-radius and stays neutral by design)
    expect(channel(m, 5, 5, 0)).not.toBe(128);
    expect(channel(m, 5, 5, 1)).not.toBe(128);
    expect(channel(m, 1, 1, 0)).toBe(128); // outside the rounded corner
  });

  it('channels never leave the byte range the map can express', () => {
    const m = lensMap(64, 64, 31, 8, LENS_MAX_DISP);
    for (let i = 0; i < m.data.length; i += 4) {
      expect(m.data[i]).toBeGreaterThanOrEqual(0);
      expect(m.data[i]).toBeLessThanOrEqual(255);
    }
  });
});

describe('lens wiring helpers', () => {
  it('scale recovers the intended peak displacement', () => {
    expect(lensScale()).toBe(LENS_MAX_DISP * 2);
  });

  it('keys and css refs are stable and well-formed', () => {
    expect(lensKey(1520.4, 56, 12)).toBe('lens-w1520h56r12');
    expect(lensCss(LENS_TB_ID)).toBe('url(#lens-tb)');
    expect(lensCss(LENS_MENU_ID)).toBe('url(#lens-menu)');
  });

  it('lensSupported returns a boolean without throwing in any engine', () => {
    expect(typeof lensSupported()).toBe('boolean');
  });
});
