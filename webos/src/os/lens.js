// Lens displacement-map math for the Liquid Glass refraction effect
// (docs/planning/webos-apps/LIQUID-GLASS.md §5, phase LG4).
//
// Chromium-only progressive enhancement: an SVG filter referenced from
// `backdrop-filter: url(#…)` refracts whatever is behind the element, the
// way a thick glass edge bends light. Safari and Firefox ignore it, so
// callers must gate on lensSupported() and keep the base frost underneath.
//
// feDisplacementMap reads a map image where the R channel encodes X
// displacement and G encodes Y, 128/128 being neutral. This module is pure
// (no DOM) so the math is unit-testable; the React side encodes the map to
// a PNG data URL and swaps it into a single persistent <filter>.

export const LENS_BAND = 32; // px of edge over which refraction ramps in
export const LENS_MAX_DISP = 14; // px peak pull at the very edge

// Convex squircle profile (LIQUID-GLASS.md §1): slow onset at the outer
// rim of the band, fast rise toward the edge — reads as a rounded bevel,
// not a linear chamfer.
export const lensProfile = (t) => (1 - (1 - t) ** 4) ** 0.25;

// Signed distance to the boundary of a w×h rounded rect with corner radius
// r (canonical sdRoundBox). Negative inside, positive outside, ~0 on the
// edge; exact on the boundary and for outside points.
export function edgeDistance(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  const qx = Math.abs(x - w / 2) - (w / 2 - rr);
  const qy = Math.abs(y - h / 2) - (h / 2 - rr);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - rr;
}

// Outward unit normal of the closest boundary point, per rounded-rect
// regions: straight edges give an axis normal, corner sectors point away
// from the corner-circle center.
export function edgeNormal(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  const hx = w / 2 - rr;
  const hy = h / 2 - rr;
  const qx = Math.abs(x - w / 2) - hx;
  const qy = Math.abs(y - h / 2) - hy;
  let nx; let ny;
  if (qx > 0 && qy > 0) {
    const len = Math.hypot(qx, qy) || 1;
    nx = (qx / len) * Math.sign(x - w / 2 || 1);
    ny = (qy / len) * Math.sign(y - h / 2 || 1);
  } else if (qx > 0) {
    nx = Math.sign(x - w / 2 || 1); ny = 0;
  } else {
    nx = 0; ny = Math.sign(y - h / 2 || 1);
  }
  return [nx, ny];
}

// Build the displacement map: { width, height, data } with RGBA bytes.
// Interior (beyond the band) stays exactly neutral; inside the band the
// displacement follows the squircle profile along the inward normal, so a
// backdrop-filtered edge appears to bend toward the slab like thick glass.
export function lensMap(w, h, r, band = LENS_BAND, maxDisp = LENS_MAX_DISP) {
  // pre-fill neutral (128,128,128,255): untouched pixels must read as zero
  // displacement, not as a full-scale shift toward (0,0)
  const data = new Uint8ClampedArray(w * h * 4).fill(128);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = edgeDistance(x + 0.5, y + 0.5, w, h, r);
      if (d >= 0 || d <= -band) continue; // outside slab or past the band → neutral
      const t = 1 + d / band; // 0 at the edge, 1 at band depth
      const mag = maxDisp * lensProfile(t);
      const [nx, ny] = edgeNormal(x + 0.5, y + 0.5, w, h, r);
      // inward = minus the outward normal; 128 + 127·component maps the
      // unit vector into the channel's ±0.498 swing around neutral
      data[i] = 128 + (-nx * 127 * mag) / maxDisp;
      data[i + 1] = 128 + (-ny * 127 * mag) / maxDisp;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

// feDisplacementMap's `scale` multiplies the channel swing (±0.498), so
// scale ≈ 2·maxDisp recovers the intended peak displacement in px.
export const lensScale = (maxDisp = LENS_MAX_DISP) => Math.round(maxDisp * 2);

// Stable filter ids — CSS references these statically (body[data-lens]
// rules); the React side swaps each filter's feImage href in place as the
// measured surface size changes.
export const LENS_TB_ID = 'lens-tb';
export const LENS_MENU_ID = 'lens-menu';
export const lensCss = (id) => `url(#${id})`;

export const lensKey = (w, h, r) => `lens-w${Math.round(w)}h${Math.round(h)}r${Math.round(r)}`;

export function lensSupported() {
  try {
    return typeof CSS !== 'undefined' && CSS.supports?.('backdrop-filter', 'url(#lens-probe)') === true;
  } catch {
    return false;
  }
}
