/* Pure helpers for the Photos viewer: path/extension triage, transform
   math (rotate/flip/crop) and canvas rendering. The transform model:
   source pixel → flip (in source frame) → rotate clockwise. A crop rect is
   stored normalized in SOURCE coordinates so it stays glued to the image
   region when the user keeps rotating/flipping after dragging it; display
   space conversions go through cropToDisplay/cropFromDisplay. */

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|svg|ico)$/i;

export const isImageName = (name, type) =>
  (type || '').startsWith('image/') || IMAGE_EXT.test(name || '');

export const folderOf = (path) => {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
};

export const baseName = (path) => path.slice(path.lastIndexOf('/') + 1);

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

/* Render the transformed image (and optional display-space crop) into a
   canvas at natural resolution. Returns the canvas — encode with canvasBlob.
   `img` is an HTMLImageElement (or any canvas-drawable with width/height). */
export function renderImage(img, { rot = 0, flipH = false, flipV = false }, crop = null) {
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
