// Persona ↔ theme wiring: every persona must name a preset that actually
// exists, and every preset's text/dim must clear WCAG AAA on its own chrome.
// (The tui persona shipped pointing at a nonexistent 'grid' preset for two
// releases and silently themed as midnight — this file is the tripwire.)
import { describe, it, expect } from 'vitest';
import { PERSONAS, personaOf } from '../src/os/personas.js';
import { THEME_PRESETS } from '../src/os/state.jsx';

/* WCAG relative luminance + contrast ratio for #rrggbb pairs. */
const luminance = (hex) => {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/* Chrome is semi-transparent; flatten it over plausible dark-wallpaper
   extremes so the ratio is checked against the darkest composite a user
   can realistically sit the shell on. */
const flatten = (rgba, base) => {
  const m = rgba.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (!m) return rgba; // opaque — use as-is
  const [, r, g, b, a] = m;
  const baseC = base.replace('#', '').match(/../g).map((h) => parseInt(h, 16));
  const mix = (s, i) => Math.round(Number(s) * Number(a) + baseC[i] * (1 - Number(a)));
  return `#${[mix(r, 0), mix(g, 1), mix(b, 2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

describe('persona registry', () => {
  it('has unique ids and a working fallback lookup', () => {
    const ids = PERSONAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(personaOf('tui').id).toBe('tui');
    expect(personaOf('no-such-persona').id).toBe(PERSONAS[0].id);
  });

  it('every persona names a theme preset that exists', () => {
    for (const p of PERSONAS) {
      expect(THEME_PRESETS[p.preset], `${p.id} → preset "${p.preset}"`).toBeDefined();
    }
  });

  it('every persona record carries the fields setPersona applies', () => {
    for (const p of PERSONAS) {
      expect(p.label).toBeTruthy();
      expect(p.tagline).toBeTruthy();
      expect(p.accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(['top', 'bottom']).toContain(p.taskbar);
      expect(['left', 'center', 'right']).toContain(p.align ?? 'left');
    }
  });
});

describe('theme presets', () => {
  it('every preset has a complete field set', () => {
    for (const [key, t] of Object.entries(THEME_PRESETS)) {
      for (const field of ['label', 'text', 'dim', 'chrome', 'line', 'bg', 'paper']) {
        expect(t[field], `${key}.${field}`).toBeTruthy();
      }
    }
  });

  // --paper is the opaque document fill (.win-body) — app text sits directly
  // on it, so it must clear AAA on its own (no flattening needed: it's opaque)
  it('text clears AAA (≥7:1) on the paper fill', () => {
    for (const [key, t] of Object.entries(THEME_PRESETS)) {
      expect(contrast(t.text, t.paper), `${key} text on paper`).toBeGreaterThanOrEqual(7);
      expect(contrast(t.dim, t.paper), `${key} dim on paper`).toBeGreaterThanOrEqual(7);
    }
  });

  it('text clears AAA (≥7:1) on the flattened chrome', () => {
    for (const [key, t] of Object.entries(THEME_PRESETS)) {
      for (const base of ['#000000', '#3a3a44']) {
        const panel = flatten(t.chrome, base);
        expect(contrast(t.text, panel), `${key} text on chrome(${base})`).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('dim text clears AAA (≥7:1) on the flattened chrome', () => {
    for (const [key, t] of Object.entries(THEME_PRESETS)) {
      for (const base of ['#000000', '#3a3a44']) {
        const panel = flatten(t.chrome, base);
        expect(contrast(t.dim, panel), `${key} dim on chrome(${base})`).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('light preset uses dark text (sanity on polarity)', () => {
    expect(luminance(THEME_PRESETS.light.text)).toBeLessThan(luminance(THEME_PRESETS.light.dim) + 0.5);
    expect(contrast(THEME_PRESETS.light.text, flatten(THEME_PRESETS.light.chrome, '#e8e8ee'))).toBeGreaterThanOrEqual(7);
  });
});
