// Snap zones: pointer → zone, zone → rect. Sizes are passed explicitly so
// the geometry math is tested without relying on the happy-dom viewport.
import { describe, it, expect } from 'vitest';
import { EDGE, SNAP_ZONES, zoneAt, zoneRect } from '../src/os/snap.js';

describe('zoneAt', () => {
  const VW = 800, VH = 600, E = EDGE;

  it('classifies the four corners before the edges', () => {
    expect(zoneAt(0, 0, VW, VH)).toBe('tl');
    expect(zoneAt(VW - 1, 0, VW, VH)).toBe('tr');
    expect(zoneAt(0, VH - 1, VW, VH)).toBe('bl');
    expect(zoneAt(VW - 1, VH - 1, VW, VH)).toBe('br');
  });

  it('classifies edges, top maximizes', () => {
    expect(zoneAt(E, VH / 2, VW, VH)).toBe('left');
    expect(zoneAt(VW - E, VH / 2, VW, VH)).toBe('right');
    expect(zoneAt(VW / 2, 0, VW, VH)).toBe('top');
  });

  it('interior pointers are not in any zone', () => {
    expect(zoneAt(VW / 2, VH / 2, VW, VH)).toBeNull();
    // one pixel past both bands is the closest an interior point gets
    expect(zoneAt(E + 1, E + 1, VW, VH)).toBeNull();
  });

  it('honors the exact capture band edges', () => {
    expect(zoneAt(E, VH / 2, VW, VH)).toBe('left');
    expect(zoneAt(E + 1, VH / 2, VW, VH)).toBeNull();
    expect(zoneAt(VW - E, VH / 2, VW, VH)).toBe('right');
    expect(zoneAt(VW - E - 1, VH / 2, VW, VH)).toBeNull();
  });
});

describe('zoneRect', () => {
  it('halves span the full viewport height', () => {
    expect(zoneRect('left', 801, 600)).toEqual({ x: 0, y: 0, w: 400, h: 600 });
    expect(zoneRect('right', 801, 600)).toEqual({ x: 401, y: 0, w: 400, h: 600 });
  });

  it('quarters take the floored half in each axis', () => {
    expect(zoneRect('tl', 801, 601)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
    expect(zoneRect('tr', 801, 601)).toEqual({ x: 401, y: 0, w: 400, h: 300 });
    expect(zoneRect('bl', 801, 601)).toEqual({ x: 0, y: 301, w: 400, h: 300 });
    expect(zoneRect('br', 801, 601)).toEqual({ x: 401, y: 301, w: 400, h: 300 });
  });

  it('any other zone (top) maximizes to the full viewport', () => {
    expect(zoneRect('top', 801, 600)).toEqual({ x: 0, y: 0, w: 801, h: 600 });
  });

  it('zone list is exactly the seven supported zones', () => {
    expect(SNAP_ZONES).toEqual(['left', 'right', 'tl', 'tr', 'bl', 'br', 'top']);
  });
});
