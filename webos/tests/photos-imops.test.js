// Photos transform math: triage, rotation geometry, crop mapping, save types.
import { describe, it, expect } from 'vitest';
import {
  IMAGE_EXT, isImageName, folderOf, baseName, mimeFor, normRot, rotDims,
  normCrop, ptToDisplay, ptFromDisplay, cropToDisplay, cropFromDisplay,
  wrapIndex,
} from '../src/apps/photos/imops.js';

describe('image triage', () => {
  it('accepts known image extensions and image/* types', () => {
    for (const n of ['a.png', 'b.JPG', 'c.jpeg', 'd.webp', 'e.avif', 'f.svg', 'shot.2024.03.png']) {
      expect(IMAGE_EXT.test(n)).toBe(true);
    }
    expect(isImageName('blob', 'image/png')).toBe(true);
    expect(isImageName('x.jpg')).toBe(true);
  });

  it('rejects non-image names and types', () => {
    expect(isImageName('notes.txt', 'text/plain')).toBe(false);
    expect(isImageName('clip.mp4', 'video/mp4')).toBe(false);
    expect(isImageName('stuff.bin')).toBe(false);
    expect(isImageName('')).toBe(false);
  });

  it('splits folder and base names', () => {
    expect(folderOf('/Home/pics/a.png')).toBe('/Home/pics');
    expect(folderOf('/a.png')).toBe('/');
    expect(baseName('/Home/pics/a.png')).toBe('a.png');
  });

  it('maps extensions to encodable mime types (PNG fallback)', () => {
    expect(mimeFor('/Home/a.jpg')).toBe('image/jpeg');
    expect(mimeFor('/Home/a.JPEG')).toBe('image/jpeg');
    expect(mimeFor('/Home/a.webp')).toBe('image/webp');
    expect(mimeFor('/Home/a.png')).toBe('image/png');
    expect(mimeFor('/Home/a.bmp')).toBe('image/png'); // canvas can't encode bmp
  });
});

describe('rotation geometry', () => {
  it('normalizes rotation into [0, 360)', () => {
    expect(normRot(90)).toBe(90);
    expect(normRot(360)).toBe(0);
    expect(normRot(-90)).toBe(270);
    expect(normRot(450)).toBe(90);
  });

  it('swaps dimensions only for quarter turns', () => {
    expect(rotDims(800, 600, 0)).toEqual([800, 600]);
    expect(rotDims(800, 600, 90)).toEqual([600, 800]);
    expect(rotDims(800, 600, 180)).toEqual([800, 600]);
    expect(rotDims(800, 600, 270)).toEqual([600, 800]);
    expect(rotDims(800, 600, 45)).toEqual([800, 600]);
  });
});

describe('crop rect normalization', () => {
  it('clamps into the unit square keeping a minimum size', () => {
    expect(normCrop({ x: -0.2, y: 0.9, w: 0.5, h: 0.5 })).toEqual({ x: 0, y: 0.5, w: 0.5, h: 0.5 });
    expect(normCrop({ x: 0.9, y: 0, w: 0.5, h: 0.5 })).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
  });

  it('enforces the minimum crop size', () => {
    const r = normCrop({ x: 0.5, y: 0.5, w: 0.001, h: 0.001 });
    expect(r.w).toBeGreaterThanOrEqual(0.05);
    expect(r.h).toBeGreaterThanOrEqual(0.05);
    expect(r.x + r.w).toBeLessThanOrEqual(1);
    expect(r.y + r.h).toBeLessThanOrEqual(1);
  });
});

describe('display space mapping', () => {
  it('maps corners exactly for every rotation with no flips', () => {
    expect(ptToDisplay(0, 0, 0, false, false)).toEqual([0, 0]); // TL → TL
    expect(ptToDisplay(1, 0, 90, false, false)).toEqual([1, 1]); // CW: right edge → bottom, TR → BR
    expect(ptToDisplay(1, 1, 180, false, false)).toEqual([0, 0]); // BR → TL
    expect(ptToDisplay(0, 1, 270, false, false)).toEqual([1, 1]); // CCW: BL → BR
  });

  it('flips apply in source frame before rotation', () => {
    // flipH at rot 0 mirrors x
    expect(ptToDisplay(0.2, 0.3, 0, true, false)).toEqual([0.8, 0.3]);
    expect(ptToDisplay(0.2, 0.3, 0, false, true)).toEqual([0.2, 0.7]);
  });

  it('round-trips points through display and back for all transforms', () => {
    for (const rot of [0, 90, 180, 270]) {
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          const [sx, sy] = [0.25, 0.7];
          const [dx, dy] = ptToDisplay(sx, sy, rot, flipH, flipV);
          expect(ptFromDisplay(dx, dy, rot, flipH, flipV)).toEqual([sx, sy]);
        }
      }
    }
  });

  it('round-trips crop rects through display and back for all transforms', () => {
    const crop = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    for (const rot of [0, 90, 180, 270]) {
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          const shown = cropToDisplay(crop, rot, flipH, flipV);
          expect(shown.x + shown.w).toBeLessThanOrEqual(1.0001);
          expect(shown.y + shown.h).toBeLessThanOrEqual(1.0001);
          expect(cropFromDisplay(shown, rot, flipH, flipV).x).toBeCloseTo(crop.x, 6);
          expect(cropFromDisplay(shown, rot, flipH, flipV).y).toBeCloseTo(crop.y, 6);
          expect(cropFromDisplay(shown, rot, flipH, flipV).w).toBeCloseTo(crop.w, 6);
          expect(cropFromDisplay(shown, rot, flipH, flipV).h).toBeCloseTo(crop.h, 6);
        }
      }
    }
  });

  it('maps a known 90° case: display top half is source left half', () => {
    // rot 90 CW turns the source's left column into the display's top row
    const shown = cropToDisplay({ x: 0, y: 0, w: 0.5, h: 1 }, 90, false, false);
    expect(shown).toEqual({ x: 0, y: 0, w: 1, h: 0.5 });
  });

  it('rects keep their area across quarter turns and flips', () => {
    const crop = { x: 0.2, y: 0.3, w: 0.25, h: 0.5 };
    const shown = cropToDisplay(crop, 270, true, true);
    expect(shown.w * shown.h).toBeCloseTo(crop.w * crop.h, 6);
  });
});

describe('navigation', () => {
  it('wraps indices forward and backward', () => {
    expect(wrapIndex(0, 3, -1)).toBe(2);
    expect(wrapIndex(2, 3, 1)).toBe(0);
    expect(wrapIndex(1, 3, 1)).toBe(2);
    expect(wrapIndex(0, 3, 0)).toBe(0);
  });

  it('is safe on an empty list', () => {
    expect(wrapIndex(0, 0, 1)).toBe(0);
  });
});
