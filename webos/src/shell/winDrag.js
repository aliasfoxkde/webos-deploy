import { zoneAt } from '../os/snap.js';

// Shared titlebar move-drag with edge snapping, used by Window.jsx and the
// VirtualWindow in App.jsx (one implementation — no per-window forks).
//
// Behavior:
//  - the window follows the pointer; dragging within EDGE px of a screen edge
//    reports a zone via onHint so the caller can draw the snap preview
//  - drop in a side/corner zone → os.snap tiles the window; top edge →
//    maximize (the canonical win.max representation)
//  - dragging a tiled or maximized window "tears it off": the pre-snap size
//    is restored under the pointer on the first significant move
export function startMoveDrag(e, win, os, onHint) {
  const start = { x: e.clientX, y: e.clientY, rect: { ...win.rect } };
  const wasSnapped = !!win.snap;
  const wasMax = !!win.max;
  let torn = false;
  let zone = null;

  const move = (ev) => {
    if ((wasSnapped || wasMax) && !torn) {
      // Tear off: restore the remembered size, keeping the grab point at the
      // same relative position on the titlebar.
      torn = true;
      const pre = win.pre || start.rect;
      const frac = start.rect.w ? (start.x - start.rect.x) / start.rect.w : 0.5;
      start.rect = {
        x: Math.round(ev.clientX - pre.w * frac),
        y: Math.max(0, ev.clientY - 18),
        w: pre.w,
        h: pre.h,
      };
      if (wasMax) os.toggleMax(win.id);
    }
    os.setRect(win.id, {
      ...start.rect,
      x: Math.max(-start.rect.w + 90, ev.clientX - (start.x - start.rect.x)),
      y: Math.max(0, Math.min(window.innerHeight - 100, ev.clientY - (start.y - start.rect.y))),
    });
    zone = zoneAt(ev.clientX, ev.clientY);
    onHint?.(zone);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (zone === 'top') os.toggleMax(win.id);
    else if (zone) os.snap(win.id, zone);
    onHint?.(null);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
