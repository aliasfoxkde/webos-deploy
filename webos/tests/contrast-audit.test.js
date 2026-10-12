// Contrast auditor — the token-level WCAG gate on top of personas-theme.
// personas-theme proves text/dim clear AAA on paper and chrome; this file
// covers the pairs that regressed in practice: the Calculator shipped
// hardcoded to the midnight palette (dark window + #f87171 error text ≈
// 2.2:1 in Daylight) and the focused-window ring was white at 18% alpha
// (invisible on light chrome, ≈1.3:1 even on dark). Enforces:
//   --danger   ≥ 7:1 on paper, ≥ 4.5:1 on flattened chrome   (1.4.6/1.4.3)
//   --win-focus ≥ 3:1 vs the chrome it borders               (1.4.11)
//   --accent-ink ≥ 7:1 on every ACCENTS swatch               (1.4.6)
// and scans app CSS for preset surface hexes so the hardcoded-palette class
// of defect can't come back.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ACCENTS, THEME_PRESETS } from '../src/os/state.jsx';
import { contrast, contrastOver, flatten, luminance } from './theme-math.js';

// Wallpaper extremes the shell can realistically sit on: two dark, two light.
const WALLPAPER_EXTREMES = ['#000000', '#3a3a44', '#dde4ee', '#ffffff'];

const cssFiles = (dir = 'src') =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return cssFiles(p);
    return e.name.endsWith('.css') ? [p] : [];
  });

describe('--danger ink per preset', () => {
  it('clears AAA (≥7:1) on the paper fill (app error text sits here)', () => {
    for (const [key, t] of Object.entries(THEME_PRESETS)) {
      expect(contrast(t.danger, t.paper), `${key} danger on paper`).toBeGreaterThanOrEqual(7);
    }
  });

  it('clears AA (≥4.5:1) on flattened chrome at every wallpaper extreme', () => {
    for (const [key, t] of Object.entries(THEME_PRESETS)) {
      for (const base of WALLPAPER_EXTREMES) {
        const panel = flatten(t.chrome, base);
        expect(contrast(t.danger, panel), `${key} danger on chrome(${base})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('--win-focus ring per preset', () => {
  // The focused-window border is the window-state indicator; WCAG 1.4.11
  // wants 3:1 against the adjacent surface. The ring sits on the chrome edge,
  // flattened over each wallpaper extreme, and is itself semi-transparent.
  it('reads ≥3:1 against the flattened chrome at every wallpaper extreme', () => {
    for (const [key, t] of Object.entries(THEME_PRESETS)) {
      for (const base of WALLPAPER_EXTREMES) {
        const panel = flatten(t.chrome, base);
        expect(contrastOver(t.focus, panel), `${key} focus ring on chrome(${base})`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('is visible in both polarities (dark presets: lighter ring; Daylight: darker ring)', () => {
    for (const [key, t] of Object.entries(THEME_PRESETS)) {
      const panel = flatten(t.chrome, '#000000');
      const ring = flatten(t.focus, panel);
      const lighter = luminance(ring) > luminance(panel);
      expect(lighter, `${key} ring polarity`).toBe(key !== 'light');
    }
  });
});

describe('--accent-ink on accent fills', () => {
  it('clears AAA (≥7:1) against every selectable accent, darkest first', () => {
    const ink = '#000000'; // the :root --accent-ink fallback
    for (const accent of ACCENTS) {
      expect(contrast(ink, accent), `ink on ${accent}`).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('app CSS stays on tokens', () => {
  // The original defect: app stylesheets pinning preset palette hexes, which
  // renders fine on midnight and breaks polarity everywhere else. No app CSS
  // may hardcode any preset's paper fill.
  it('hardcodes no preset paper color outside the :root fallback', () => {
    const papers = Object.values(THEME_PRESETS).map((t) => t.paper.toLowerCase());
    const offenders = cssFiles().flatMap((f) => {
      const lines = readFileSync(f, 'utf8').split('\n');
      return lines
        .map((line, i) => ({ line: line.toLowerCase(), i }))
        .filter(({ line }) => papers.some((p) => line.includes(p)))
        .map(({ line, i }) => `${f}:${i + 1} ${line.trim()}`);
    });
    // The one allowed occurrence: the :root --paper fallback in styles.css.
    expect(offenders).toEqual(['src/styles.css:12 --paper: #10141c;']);
  });

  it('the two fixed apps consume the tokens they used to bypass', () => {
    const calc = readFileSync('src/apps/calculator/calculator.css', 'utf8');
    expect(calc).toContain('background: var(--paper)');
    expect(calc).toContain('color: var(--danger)');
    expect(calc).toContain('color: var(--accent-ink)');
    const chat = readFileSync('src/apps/chat/chat.css', 'utf8');
    expect(chat).toContain('background: var(--paper)');
  });
});

/* The full ink×surface enumeration. Paper is the reading surface (AAA 1.4.6:
   7:1 for all text); chrome panels are alpha-composited over unknown
   wallpapers, so text there is held to the file's documented 4.5:1 (1.4.3)
   floor at every wallpaper extreme. Desktop labels sit raw on the wallpaper
   and are therefore gated at 7:1 over a scrim the CSS must provide. */
describe('every preset ink clears AAA on paper', () => {
  it('--text ≥ 7:1 and --text-dim ≥ 7:1 on the paper fill', () => {
    for (const [key, t] of Object.entries(THEME_PRESETS)) {
      expect(contrast(t.text, t.paper), `${key} text on paper`).toBeGreaterThanOrEqual(7);
      expect(contrast(t.dim, t.paper), `${key} dim on paper`).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('panel text on composited chrome', () => {
  it('--text and --text-dim hold 4.5:1 at every wallpaper extreme', () => {
    for (const [key, t] of Object.entries(THEME_PRESETS)) {
      for (const base of WALLPAPER_EXTREMES) {
        const panel = flatten(t.chrome, base);
        expect(contrast(t.text, panel), `${key} text on chrome(${base})`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.dim, panel), `${key} dim on chrome(${base})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('desktop labels survive any wallpaper (scrim pill)', () => {
  // The label rules are read back out of styles.css so the math can't drift
  // from the stylesheet: ink colors and the scrim are parsed, then checked
  // over the same wallpaper extremes.
  const rule = (sel) => {
    const css = readFileSync('src/styles.css', 'utf8');
    const m = css.match(new RegExp(`${sel.replace('.', '\\.')} \\{([^}]*)\\}`));
    return m ? m[1] : '';
  };
  const prop = (body, name) => {
    const m = body.match(new RegExp(`${name}:\\s*([^;]+);`));
    return m ? m[1].trim() : null;
  };

  it('labels and version chips declare a scrim background, not just a shadow', () => {
    for (const sel of ['.desk-icon .lbl', '.desk-icon .ver']) {
      const body = rule(sel);
      expect(body, `${sel} exists`).toBeTruthy();
      expect(prop(body, 'background'), `${sel} scrim`).toMatch(/rgba\(8,\s*12,\s*18/);
    }
  });

  it('label ink and version ink hold 7:1 over the scrim at every extreme', () => {
    for (const sel of ['.desk-icon .lbl', '.desk-icon .ver']) {
      const body = rule(sel);
      const ink = prop(body, 'color');
      const scrim = prop(body, 'background');
      for (const base of WALLPAPER_EXTREMES) {
        const panel = flatten(scrim, base);
        expect(contrast(ink, panel), `${sel} ink over scrim(${base})`).toBeGreaterThanOrEqual(7);
      }
    }
  });
});
