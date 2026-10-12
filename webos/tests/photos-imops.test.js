// Photos transform math: triage, rotation geometry, crop mapping, save
// types, tonal-adjustment curves, annotation geometry and stroke drawing.
import { describe, it, expect } from 'vitest';
import {
  IMAGE_EXT, isImageName, folderOf, baseName, mimeFor, normRot, rotDims, editedName,
  normCrop, ptToDisplay, ptFromDisplay, cropToDisplay, cropFromDisplay,
  wrapIndex, ADJUST_DEFAULTS, isAdjusted, adjustFilter, adjustLuts,
  hexA, shapeFromDisplay, drawAnnotations, applyAdjust,
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

describe('edited-copy naming', () => {
  it('suffixes -edited, keeping the extension (defaulting to .png)', () => {
    expect(editedName('cat.png', new Set())).toBe('cat-edited.png');
    expect(editedName('cat.jpg', new Set())).toBe('cat-edited.jpg');
    expect(editedName('noext', new Set())).toBe('noext-edited.png');
    expect(editedName('', new Set())).toBe('image-edited.png');
  });

  it('dedupes against taken names by advancing the counter', () => {
    const taken = new Set(['cat.png', 'cat-edited.png', 'cat-edited-2.png']);
    expect(editedName('cat.png', taken)).toBe('cat-edited-3.png');
    expect(editedName('cat.png', new Set(['cat-edited.png']))).toBe('cat-edited-2.png');
  });

  it('keeps advancing through a fully-collided folder (no infinite loop)', () => {
    // Regression: the loop used a constant `-2` suffix, so a folder holding
    // both `x-edited.png` and `x-edited-2.png` spun forever.
    const taken = new Set(['x.png', 'x-edited.png', 'x-edited-2.png', 'x-edited-3.png']);
    expect(editedName('x.png', taken)).toBe('x-edited-4.png');
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

describe('tonal adjustments', () => {
  it('detects non-neutral adjustment state', () => {
    expect(isAdjusted(ADJUST_DEFAULTS)).toBe(false);
    expect(isAdjusted(undefined)).toBe(false);
    expect(isAdjusted({ exposure: 0.1 })).toBe(true);
    expect(isAdjusted({ contrast: -0.5 })).toBe(true);
    expect(isAdjusted({ saturation: 1 })).toBe(true);
  });

  it('builds the preview filter string from non-neutral channels', () => {
    expect(adjustFilter(ADJUST_DEFAULTS)).toBe('none');
    expect(adjustFilter({ exposure: 1, contrast: 0, saturation: 0 })).toBe('brightness(2.0000)');
    expect(adjustFilter({ exposure: 0, contrast: 0.5, saturation: 0 })).toBe('contrast(1.5000)');
    expect(adjustFilter({ exposure: 0, contrast: 0, saturation: -0.5 })).toBe('saturate(0.5000)');
    expect(adjustFilter({ exposure: 1, contrast: 0.5, saturation: -0.5 }))
      .toBe('brightness(2.0000) contrast(1.5000) saturate(0.5000)');
  });

  it('the LUT is monotonic and clamped, boosting exposure mid-tones', () => {
    const flat = adjustLuts(ADJUST_DEFAULTS);
    for (let v = 0; v < 256; v++) expect(flat[v]).toBe(v);
    const lit = adjustLuts({ exposure: 1, contrast: 0, saturation: 0 });
    expect(lit[0]).toBe(0);
    expect(lit[255]).toBe(255);
    for (let v = 1; v < 256; v++) expect(lit[v]).toBeGreaterThanOrEqual(lit[v - 1]);
    expect(lit[100]).toBeGreaterThan(195); // ×2 gain, clamped into range
    expect(lit[100]).toBeLessThanOrEqual(255);
  });

  it('contrast pivots around mid-gray: 0→0, 255→255, mids spread', () => {
    const hard = adjustLuts({ exposure: 0, contrast: 1, saturation: 0 }); // k = 2
    expect(hard[0]).toBe(0);
    expect(hard[255]).toBe(255);
    expect(hard[64]).toBeLessThan(64);
    expect(hard[192]).toBeGreaterThan(192);
  });

  it('hexA appends clamped alpha as hex (3-digit colors expand)', () => {
    expect(hexA('#ff4d4f', 0.25)).toBe('#ff4d4f40');
    expect(hexA('#fff', 1)).toBe('#ffffffff');
    expect(hexA('#ffffff', 2)).toBe('#ffffffff'); // clamped
    expect(hexA('#ffffff', -1)).toBe('#ffffff00');
    expect(hexA('', 0.5)).toBe('#ffffff80'); // safe default
  });
});

describe('annotation geometry', () => {
  it('maps pen points and round-trips them through every transform', () => {
    const d = { pts: [[0.1, 0.2], [0.5, 0.5], [0.9, 0.8]] };
    for (const rot of [0, 90, 180, 270]) {
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          const s = shapeFromDisplay('pen', d, rot, flipH, flipV, { color: '#ff0000', width: 0.008 });
          expect(s.pts).toHaveLength(3);
          for (let i = 0; i < 3; i++) {
            const [dx, dy] = ptToDisplay(s.pts[i][0], s.pts[i][1], rot, flipH, flipV);
            expect(dx).toBeCloseTo(d.pts[i][0], 9);
            expect(dy).toBeCloseTo(d.pts[i][1], 9);
          }
          expect(s.color).toBe('#ff0000');
        }
      }
    }
  });

  it('maps rect corners axis-aligned: display top half → source left half at 90°', () => {
    const s = shapeFromDisplay('rect', { x1: 0, y1: 0, x2: 1, y2: 0.5 }, 90, false, false, {});
    expect(s).toMatchObject({ kind: 'rect', x: 0, y: 0, w: 0.5, h: 1 });
    expect(s.w * s.h).toBeCloseTo(0.5, 9); // area preserved
  });

  it('keeps line endpoints as endpoints (no corner sorting)', () => {
    const s = shapeFromDisplay('arrow', { x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.7 }, 0, false, false, { width: 0.008 });
    expect(s.x1).toBeCloseTo(0.2, 9);
    expect(s.y1).toBeCloseTo(0.2, 9);
    expect(s.x2).toBeCloseTo(0.8, 9);
    expect(s.y2).toBeCloseTo(0.7, 9);
  });

  it('text anchors at its click point and carries size', () => {
    const s = shapeFromDisplay('text', { x1: 0.25, y1: 0.75 }, 180, true, false, { size: 0.05 });
    const [dx, dy] = ptToDisplay(s.x, s.y, 180, true, false);
    expect(dx).toBeCloseTo(0.25, 9);
    expect(dy).toBeCloseTo(0.75, 9);
    expect(s.size).toBe(0.05);
  });
});

describe('annotation drawing', () => {
  // a recording 2d context: every method call lands in `calls` as [name, ...args]
  const recCtx = () => {
    const calls = [];
    const store = { calls };
    const ctx = new Proxy(store, {
      get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])),
      set: (t, k, v) => { t[k] = v; return true; },
    });
    return { ctx, calls };
  };

  it('pen draws one polyline and stroke', () => {
    const { ctx, calls } = recCtx();
    drawAnnotations(ctx, [{ kind: 'pen', pts: [[0.1, 0.1], [0.5, 0.5], [0.9, 0.1]], color: '#ff0000', width: 0.01 }], 200, 100);
    const names = calls.map((c) => c[0]);
    expect(names.filter((n) => n === 'moveTo')).toHaveLength(1);
    expect(names.filter((n) => n === 'lineTo')).toHaveLength(2);
    expect(names).toContain('stroke');
    expect(ctx.lineWidth).toBe(1); // 0.01 × height 100, at the 1px floor
    expect(ctx.strokeStyle).toBe('#ff0000');
  });

  it('draws inside the centered image frame (translate −w/2, −h/2)', () => {
    const { ctx, calls } = recCtx();
    drawAnnotations(ctx, [{ kind: 'rect', x: 0.5, y: 0.5, w: 0.2, h: 0.2, color: '#00ff00', width: 0.01 }], 200, 100);
    const tr = calls.find((c) => c[0] === 'translate');
    expect(tr[1]).toBe(-100); // -w/2
    expect(tr[2]).toBe(-50); // -h/2
    expect(calls[0][0]).toBe('save');
    expect(calls[calls.length - 1][0]).toBe('restore');
  });

  it('filled shapes fill at 25% alpha then stroke at full', () => {
    const { ctx, calls } = recCtx();
    drawAnnotations(ctx, [{ kind: 'rect', x: 0.1, y: 0.1, w: 0.3, h: 0.2, color: '#00ff00', width: 0.01, fill: true }], 200, 100);
    const names = calls.map((c) => c[0]).filter((n) => n !== 'save' && n !== 'translate' && n !== 'restore');
    expect(names).toEqual(['beginPath', 'rect', 'fill', 'stroke']);
    expect(ctx.fillStyle).toBe('#00ff0040');
    expect(ctx.strokeStyle).toBe('#00ff00');
  });

  it('unfilled shapes only stroke', () => {
    const { ctx, calls } = recCtx();
    drawAnnotations(ctx, [{ kind: 'ellipse', x: 0.1, y: 0.1, w: 0.3, h: 0.2, color: '#00ff00', width: 0.01 }], 200, 100);
    const names = calls.map((c) => c[0]).filter((n) => n !== 'save' && n !== 'translate' && n !== 'restore');
    expect(names).toEqual(['beginPath', 'ellipse', 'stroke']);
  });

  it('arrows draw the shaft plus a two-stroke head', () => {
    const { ctx, calls } = recCtx();
    drawAnnotations(ctx, [{ kind: 'arrow', x1: 0, y1: 0, x2: 1, y2: 1, color: '#ffffff', width: 0.01 }], 100, 100);
    const names = calls.map((c) => c[0]);
    expect(names.filter((n) => n === 'stroke')).toHaveLength(2);
    expect(names.filter((n) => n === 'beginPath')).toHaveLength(2);
    expect(names.filter((n) => n === 'moveTo')).toHaveLength(3); // shaft + 2 head strokes
  });

  it('text sets a font sized by fraction of height and fills the label', () => {
    const { ctx, calls } = recCtx();
    drawAnnotations(ctx, [{ kind: 'text', x: 0.25, y: 0.5, text: 'hi', color: '#ffffff', size: 0.05 }], 200, 100);
    expect(ctx.font).toContain('5px'); // 0.05 × 100
    expect(ctx.font).toContain('system-ui');
    const fill = calls.find((c) => c[0] === 'fillText');
    expect(fill[1]).toBe('hi');
    expect(fill[2]).toBe(50); // 0.25 × 200 — the frame shift is the translate(-w/2,-h/2)
    expect(fill[3]).toBe(50); // 0.5 × 100
  });

  it('draws nothing for an empty list', () => {
    const { ctx, calls } = recCtx();
    drawAnnotations(ctx, [], 200, 100);
    expect(calls).toHaveLength(0);
  });
});

describe('applyAdjust baking', () => {
  // canvas double: getImageData hands back the fixture pixels; putImageData
  // copies the result out so the baked values are assertable
  const bake = (a, pixels) => {
    const px = new Uint8ClampedArray(pixels);
    let out = null;
    const canvas = {
      width: px.length / 4, height: 1,
      getContext: () => ({
        getImageData: () => ({ data: px, width: px.length / 4, height: 1 }),
        putImageData: (d) => { out = new Uint8ClampedArray(d.data); },
      }),
    };
    applyAdjust(canvas, a);
    return out;
  };

  it('exposure alone bakes through the LUT (saturation pass skipped at sat=1)', () => {
    // identity LUT when exposure/contrast are 0; 2^0.2 gain on exposure 0.2
    const out = bake({ exposure: 0.2, contrast: 0, saturation: 0 }, [100, 100, 100, 255]);
    expect(out[0]).toBe(Math.round((100 / 255) * 2 ** 0.2 * 255)); // 115
    expect(out[3]).toBe(255); // alpha untouched
  });

  it('the saturation pass mixes each channel toward Rec.701 luma', () => {
    // luma(200,100,100) ≈ 121.26 → r′ = 121.26 + 78.74·1.5 ≈ 239, g′/b′ ≈ 89
    const out = bake({ exposure: 0, contrast: 0, saturation: 0.5 }, [200, 100, 100, 255, 10, 20, 30, 255]);
    expect([out[0], out[1], out[2], out[3]]).toEqual([239, 89, 89, 255]);
    // luma(10,20,30) ≈ 18.60 → 6/21/36 — dark pixels spread the same way
    expect([out[4], out[5], out[6]]).toEqual([6, 21, 36]);
  });
});
