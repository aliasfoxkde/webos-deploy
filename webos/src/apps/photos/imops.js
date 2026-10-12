/* Pure helpers for the Photos viewer: path/extension triage, transform
   math (rotate/flip/crop), tonal adjustments and markup annotations, plus
   canvas rendering. The transform model: source pixel → flip (in source
   frame) → rotate clockwise. A crop rect is stored normalized in SOURCE
   coordinates so it stays glued to the image region when the user keeps
   rotating/flipping after dragging it; display space conversions go
   through cropToDisplay/cropFromDisplay. Annotations live in the same
   source space for the same reason; adjustments use filter-spec math so
   the preview and the baked save agree. */

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|svg|ico)$/i;

export const isImageName = (name, type) =>
  (type || '').startsWith('image/') || IMAGE_EXT.test(name || '');

export const folderOf = (path) => {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
};

export const baseName = (path) => path.slice(path.lastIndexOf('/') + 1);

/* Name for an edited copy: `<stem>-edited.<ext>`, deduped against the names
   already in the folder as `-edited-2`, `-edited-3`, … The counter MUST
   advance each collision — a constant suffix would never escape a folder
   holding both `x-edited.png` and `x-edited-2.png` (infinite loop). */
export function editedName(name, taken) {
  const m = name.match(/^(.*?)(\.[^.]+)?$/);
  let out = `${m[1] || 'image'}-edited${m[2] || '.png'}`;
  for (let n = 2; taken.has(out); n += 1) {
    out = `${m[1] || 'image'}-edited-${n}${m[2] || '.png'}`;
  }
  return out;
}

/* Encode type for saving back to the store — keep the original format when
   we can encode it, PNG otherwise (transparency-safe fallback). */
export function mimeFor(path) {
  if (/\.jpe?g$/i.test(path)) return 'image/jpeg';
  if (/\.webp$/i.test(path)) return 'image/webp';
  return 'image/png';
}

export const normRot = (r) => ((Number(r) || 0) % 360 + 360) % 360;

/* Canvas dimensions after a 90/270 rotation swap width and height. */
export function rotDims(w, h, rot) {
  return normRot(rot) % 180 === 90 ? [h, w] : [w, h];
}

/* Clamp a normalized rect into the unit square with a minimum size. */
export function normCrop(c, min = 0.05) {
  const w = Math.min(Math.max(c.w, min), 1);
  const h = Math.min(Math.max(c.h, min), 1);
  const x = Math.min(Math.max(c.x, 0), 1 - w);
  const y = Math.min(Math.max(c.y, 0), 1 - h);
  return { x, y, w, h };
}

/* One point, source-normalized → display-normalized (flip first, then CW
   rotation — the same order the canvas transform applies). */
export function ptToDisplay(sx, sy, rot, flipH, flipV) {
  const fx = flipH ? 1 - sx : sx;
  const fy = flipV ? 1 - sy : sy;
  switch (normRot(rot)) {
    case 90: return [1 - fy, fx];
    case 180: return [1 - fx, 1 - fy];
    case 270: return [fy, 1 - fx];
    default: return [fx, fy];
  }
}

/* One point, display-normalized → source-normalized (inverse of above). */
export function ptFromDisplay(dx, dy, rot, flipH, flipV) {
  let fx; let fy;
  switch (normRot(rot)) {
    case 90: fx = dy; fy = 1 - dx; break;
    case 180: fx = 1 - dx; fy = 1 - dy; break;
    case 270: fx = 1 - dy; fy = dx; break;
    default: fx = dx; fy = dy;
  }
  return [flipH ? 1 - fx : fx, flipV ? 1 - fy : fy];
}

const mapRect = (c, fn, rot, flipH, flipV) => {
  const [x1, y1] = fn(c.x, c.y, rot, flipH, flipV);
  const [x2, y2] = fn(c.x + c.w, c.y + c.h, rot, flipH, flipV);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
};

/* Crop rect, source space ↔ display space (rects stay axis-aligned under
   90° rotations and flips, so mapping two corners is exact). */
export const cropToDisplay = (c, rot, flipH, flipV) => mapRect(c, ptToDisplay, rot, flipH, flipV);
export const cropFromDisplay = (c, rot, flipH, flipV) => mapRect(c, ptFromDisplay, rot, flipH, flipV);

/* Wrap an index step around a list of known length (0 → 0 for empty). */
export function wrapIndex(i, len, delta) {
  if (!len) return 0;
  return ((i + delta) % len + len) % len;
}

/* Draw source-space annotations onto a context that already carries the
   image transform (translate to center → rotate → flip) AFTER the image
   was drawn at (-w/2, -h/2): this shifts into that centered frame so
   annotation (0,0) is the image's top-left, then draws. Shared by the
   live preview and the save bake. */
export function drawAnnotations(ctx, anns, w, h) {
  if (!anns.length) return;
  ctx.save();
  ctx.translate(-w / 2, -h / 2);
  const px = (frac) => Math.max(1, frac * h); // strokes/sizes scale with height
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const a of anns) {
    ctx.beginPath();
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.kind === 'rect' || a.kind === 'ellipse' ? (a.fill ? hexA(a.color, 0.25) : a.color) : a.color;
    ctx.lineWidth = px(a.width ?? 0.006);
    if (a.kind === 'pen') {
      a.pts.forEach(([nx, ny], i) => (i ? ctx.lineTo(nx * w, ny * h) : ctx.moveTo(nx * w, ny * h)));
      ctx.stroke();
    } else if (a.kind === 'rect' || a.kind === 'ellipse') {
      if (a.kind === 'rect') {
        ctx.rect(a.x * w, a.y * h, a.w * w, a.h * h);
      } else {
        ctx.ellipse((a.x + a.w / 2) * w, (a.y + a.h / 2) * h, (a.w / 2) * w, (a.h / 2) * h, 0, 0, Math.PI * 2);
      }
      if (a.fill) ctx.fill();
      ctx.stroke();
    } else if (a.kind === 'line' || a.kind === 'arrow') {
      const x1 = a.x1 * w;
      const y1 = a.y1 * h;
      const x2 = a.x2 * w;
      const y2 = a.y2 * h;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (a.kind === 'arrow') { // open V head at the drag end
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const head = Math.max(0.008 * h, px(a.width ?? 0.006) * 4);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
        ctx.stroke();
      }
    } else if (a.kind === 'text') {
      ctx.font = `600 ${px(a.size ?? 0.032)}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(a.text, a.x * w, a.y * h);
    }
  }
  ctx.restore();
}

/* Render the transformed image (and optional display-space crop) into a
   canvas at natural resolution, with annotations baked between transform
   and crop. Returns the canvas — encode with canvasBlob. `img` is an
   HTMLImageElement (or any canvas-drawable with width/height). */
export function renderImage(img, { rot = 0, flipH = false, flipV = false }, crop = null, anns = []) {
  const nw = img.naturalWidth || img.width || 1;
  const nh = img.naturalHeight || img.height || 1;
  const [W, H] = rotDims(nw, nh, rot);
  const a = document.createElement('canvas');
  a.width = Math.max(1, Math.round(W));
  a.height = Math.max(1, Math.round(H));
  const ctx = a.getContext('2d');
  ctx.translate(a.width / 2, a.height / 2);
  ctx.rotate((normRot(rot) * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(img, -nw / 2, -nh / 2);
  if (anns.length) drawAnnotations(ctx, anns, nw, nh);
  // full-frame crop (or none): return the straight transform, no re-draw
  if (!crop || (crop.w >= 1 && crop.h >= 1)) return a;
  const b = document.createElement('canvas');
  b.width = Math.max(1, Math.round(crop.w * a.width));
  b.height = Math.max(1, Math.round(crop.h * a.height));
  b.getContext('2d').drawImage(
    a,
    Math.round(crop.x * a.width), Math.round(crop.y * a.height), b.width, b.height,
    0, 0, b.width, b.height,
  );
  return b;
}

export const canvasBlob = (canvas, type = 'image/png', quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image encode failed'))), type, quality);
  });

/* ---- tonal adjustments ----
   Exposure in stops (−2..2), contrast and saturation in −1..1. The live
   preview applies them as a canvas filter; the save bake runs the SAME
   formulas per-pixel (filter-effects spec math), so an adjusted save
   matches what was on screen. */

export const ADJUST_DEFAULTS = { exposure: 0, contrast: 0, saturation: 0 };

export const isAdjusted = (a) =>
  Boolean(a && (a.exposure || a.contrast || a.saturation));

/* CSS filter string for the preview canvas; 'none' keeps the default. */
export function adjustFilter(a) {
  if (!isAdjusted(a)) return 'none';
  const parts = [];
  if (a.exposure) parts.push(`brightness(${(2 ** a.exposure).toFixed(4)})`);
  if (a.contrast) parts.push(`contrast(${(1 + a.contrast).toFixed(4)})`);
  if (a.saturation) parts.push(`saturate(${(1 + a.saturation).toFixed(4)})`);
  return parts.join(' ');
}

/* 256-entry per-channel LUT: exposure (×2^stops) then linear contrast
   ((v−½)·k+½) on normalized values, clamped — pure and unit-testable. */
export function adjustLuts(a) {
  const gain = 2 ** (a?.exposure || 0);
  const k = 1 + (a?.contrast || 0);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    lut[v] = Math.round((((v / 255) * gain - 0.5) * k + 0.5) * 255);
  }
  return lut;
}

/* Bake adjustments into a canvas: LUT for exposure+contrast, then a
   saturation pass mixing each channel toward Rec.701 luma. In place. */
export function applyAdjust(canvas, a) {
  if (!isAdjusted(a)) return canvas;
  const ctx = canvas.getContext('2d');
  if (!ctx || !canvas.width || !canvas.height) return canvas;
  const lut = adjustLuts(a);
  const sat = 1 + (a.saturation || 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    let r = lut[px[i]];
    let g = lut[px[i + 1]];
    let b = lut[px[i + 2]];
    if (sat !== 1) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l + (r - l) * sat;
      g = l + (g - l) * sat;
      b = l + (b - l) * sat;
    }
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/* ---- markup annotations ----
   Shapes are stored in SOURCE-normalized coordinates (glued to image
   pixels through later rotate/flip, like crop rects); `size` scales text
   and `width` scales strokes as fractions of source height. Created from
   display-space drags via shapeFromDisplay, drawn by drawAnnotations on a
   context already transformed the way renderImage transforms the image. */

/* #rrggbb + alpha → #rrggbbaa (fills read at 25% over the stroke color). */
export const hexA = (hex, alpha) => {
  let h = String(hex || '#ffffff').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length < 6) h = 'ffffff';
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `#${h.slice(0, 6)}${a.toString(16).padStart(2, '0')}`;
};

/* A display-space drag → a source-space shape. Rects/ellipses map their
   two corners (axis-aligned under quarter turns and flips, like crops);
   pen and line points map individually. opts carries color/width/fill/size. */
export function shapeFromDisplay(kind, d, rot, flipH, flipV, opts = {}) {
  if (kind === 'pen') {
    return { kind, pts: d.pts.map(([x, y]) => ptFromDisplay(x, y, rot, flipH, flipV)), ...opts };
  }
  if (kind === 'text') {
    const [x, y] = ptFromDisplay(d.x1, d.y1, rot, flipH, flipV);
    return { kind, x, y, ...opts };
  }
  if (kind === 'line' || kind === 'arrow') {
    const [x1, y1] = ptFromDisplay(d.x1, d.y1, rot, flipH, flipV);
    const [x2, y2] = ptFromDisplay(d.x2, d.y2, rot, flipH, flipV);
    return { kind, x1, y1, x2, y2, ...opts };
  }
  const rect = {
    x: Math.min(d.x1, d.x2), y: Math.min(d.y1, d.y2),
    w: Math.abs(d.x2 - d.x1), h: Math.abs(d.y2 - d.y1),
  };
  const m = cropFromDisplay(rect, rot, flipH, flipV);
  return { kind, x: m.x, y: m.y, w: m.w, h: m.h, ...opts };
}

