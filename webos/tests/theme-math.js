// WCAG 2.x math shared by the theme/contrast suites (personas-theme,
// contrast-audit). Pure functions over #rrggbb and rgba() strings — no DOM.

/* WCAG relative luminance of a #rrggbb color. */
export const luminance = (hex) => {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/* WCAG contrast ratio between two #rrggbb colors. */
export const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const hexToRgb = (hex) => hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16));

/* Composite a color over an opaque base, returning opaque #rrggbb.
   Accepts 'rgba(r, g, b, a)' (semi-transparent theme tokens) or '#rrggbb'
   (opaque — returned unchanged). */
export const flatten = (color, base) => {
  const m = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (!m) return color; // opaque — use as-is
  const [, r, g, b, a] = m;
  const baseC = hexToRgb(base);
  const mix = (s, i) => Math.round(Number(s) * Number(a) + baseC[i] * (1 - Number(a)));
  return `#${[mix(r, 0), mix(g, 1), mix(b, 2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

/* Contrast of a semi-transparent token laid over a panel color — flattens
   the token onto the panel first, then ratios the result against the panel.
   This is how borders/rings must be measured: the indicator and the surface
   it sits on end up composited in the same pixels (WCAG 1.4.11). */
export const contrastOver = (token, panel) => contrast(flatten(token, panel), panel);
