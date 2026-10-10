// Window snap zones — drag a titlebar to a screen edge to tile the window
// (halves), into a corner (quarters), or to the top edge to maximize.
// Zone geometry matches the maximize behavior: windows span the full
// viewport height, with the taskbar overlaying them (same as win.max).

export const EDGE = 12; // px capture band at each screen edge

export const SNAP_ZONES = ['left', 'right', 'tl', 'tr', 'bl', 'br', 'top'];

// Which zone does this pointer sit in? `top` maximizes on drop.
export function zoneAt(x, y, vw = window.innerWidth, vh = window.innerHeight) {
  const L = x <= EDGE, R = x >= vw - EDGE, T = y <= EDGE, B = y >= vh - EDGE;
  if (T && L) return 'tl';
  if (T && R) return 'tr';
  if (B && L) return 'bl';
  if (B && R) return 'br';
  if (L) return 'left';
  if (R) return 'right';
  if (T) return 'top';
  return null;
}

// Target rect for a zone. Uses the same full-height convention as maximize.
export function zoneRect(zone, vw = window.innerWidth, vh = window.innerHeight) {
  const halfW = Math.floor(vw / 2);
  const halfH = Math.floor(vh / 2);
  switch (zone) {
    case 'left': return { x: 0, y: 0, w: halfW, h: vh };
    case 'right': return { x: vw - halfW, y: 0, w: halfW, h: vh };
    case 'tl': return { x: 0, y: 0, w: halfW, h: halfH };
    case 'tr': return { x: vw - halfW, y: 0, w: halfW, h: halfH };
    case 'bl': return { x: 0, y: vh - halfH, w: halfW, h: halfH };
    case 'br': return { x: vw - halfW, y: vh - halfH, w: halfW, h: halfH };
    default: return { x: 0, y: 0, w: vw, h: vh };
  }
}
