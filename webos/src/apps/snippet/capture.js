// Pure capture/region math — no DOM, fully unit-testable.

// Normalize a drag into a rect (negative drags flip).
export function rectFromDrag(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

export function isRectMeaningful(rect, min = 4) {
  return rect.w >= min && rect.h >= min;
}

// Map a viewport-space rect onto source-space coordinates of a captured
// video frame / image (letterbox-aware). Returns null when there is no
// meaningful intersection.
export function cropSourceRect(rect, viewport, source) {
  if (!viewport.w || !viewport.h || !source.w || !source.h) return null;
  const scale = Math.max(source.w / viewport.w, source.h / viewport.h);
  const shownW = source.w / scale;
  const shownH = source.h / scale;
  const offX = (viewport.w - shownW) / 2;
  const offY = (viewport.h - shownH) / 2;
  const sx = (rect.x - offX) * scale;
  const sy = (rect.y - offY) * scale;
  const sw = rect.w * scale;
  const sh = rect.h * scale;
  // Clip to the source bounds.
  const cx = Math.max(0, Math.min(sx, source.w));
  const cy = Math.max(0, Math.min(sy, source.h));
  const cx2 = Math.max(0, Math.min(sx + sw, source.w));
  const cy2 = Math.max(0, Math.min(sy + sh, source.h));
  const w = cx2 - cx;
  const h = cy2 - cy;
  if (w < 1 || h < 1) return null;
  return { x: Math.round(cx), y: Math.round(cy), w: Math.round(w), h: Math.round(h) };
}

export function timestampName(prefix = 'snippet') {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}
