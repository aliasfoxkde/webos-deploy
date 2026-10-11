// os/themes.js — color math, theme derivation, the user-theme store and the
// pack library. The AAA gates here are the contract: every pack theme must
// clear WCAG AAA (7:1) for text AND dim on its own paper, exactly like the
// built-in presets do in personas-theme.
import { describe, it, expect } from 'vitest';
import {
  luminance, contrast, flatten, normHex, rgba, mix, isLight,
  compositeBg, deriveTheme, draftFromTheme,
  normalizeUserTheme, upsertTheme, removeTheme, newThemeId, resolveTheme,
  THEME_PRESETS, ACCENTS, THEME_PACKS, PACK_INDEX, searchPacks, packToUserTheme,
} from '../src/os/themes.js';

describe('color math', () => {
  it('computes known WCAG values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#ffffff')).toBe(1);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('flattens rgba over a base and passes opaque colors through', () => {
    expect(flatten('rgba(255, 255, 255, 0.5)', '#000000')).toBe('#808080');
    expect(flatten('#123456', '#000000')).toBe('#123456');
    // half white over black then compared to pure gray of that value
    expect(contrast(flatten('rgba(255, 255, 255, 0.5)', '#000000'), '#000000')).toBeLessThan(contrast('#ffffff', '#000000'));
  });

  it('normalizes hex: 3-digit expands, garbage falls back', () => {
    expect(normHex('#ABC')).toBe('#aabbcc');
    expect(normHex('FF0000')).toBe('#ff0000');
    expect(normHex('nope', '#10141c')).toBe('#10141c');
    expect(normHex('', '#10141c')).toBe('#10141c');
  });

  it('rgba emits the house format withAlpha and flatten parse', () => {
    expect(rgba('#102030', 0.84)).toBe('rgba(16, 32, 48, 0.84)');
    expect(rgba('#ffffff', 2)).toBe('rgba(255, 255, 255, 1)');
    expect(rgba('#ffffff', -1)).toBe('rgba(255, 255, 255, 0)');
  });

  it('mixes linearly and classifies light papers', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#102030', '#102030', 0.9)).toBe('#102030');
    expect(isLight('#f7f9fc')).toBe(true);
    expect(isLight('#10141c')).toBe(false);
  });
});

describe('derivation', () => {
  it('builds a complete token set from draft fields', () => {
    const t = deriveTheme({
      paper: '#0a1410', text: '#e7f6ec', dim: '#a3c4b0', accent: '#34d399',
      glowA: '#34d399', glowB: '#a3e635', glow: 0.15, angle: 160,
    });
    for (const f of ['paper', 'text', 'dim', 'accent', 'chrome', 'line', 'danger', 'focus', 'bg']) {
      expect(t[f], `derived.${f}`).toBeTruthy();
    }
    expect(t.chrome).toBe('rgba(10, 20, 16, 0.84)'); // default chromeA
    expect(t.line).toBe('rgba(231, 246, 236, 0.12)'); // line from text
    expect(t.focus).toBe('rgba(231, 246, 236, 0.45)');
  });

  it('derives light-paper chrome: dark danger, strong focus ring', () => {
    const t = deriveTheme({ paper: '#fafafa', text: '#1c1c1c', dim: '#4b4b4b', accent: '#2563eb' });
    expect(t.danger).toBe('#991b1b');
    expect(t.focus).toBe('rgba(28, 28, 28, 0.8)');
    expect(t.bg).toContain('linear-gradient(160deg, #fafafa');
  });

  it('clamps every knob into range and falls back from garbage', () => {
    const t = deriveTheme({ paper: 'zzz', chromeA: 5, lineA: -3, glow: 99, angle: -20 });
    expect(t.paper).toBe('#10141c'); // midnight fallback
    expect(t.chrome).toContain('0.98'); // clamped high
    expect(t.line).toContain('0.04'); // clamped low
    expect(t.bg).toContain('linear-gradient(0deg'); // clamped angle
  });

  it('compositeBg keeps the house idiom (two glows + paper ramp)', () => {
    const bg = compositeBg({ paper: '#10141c', glowA: '#38bdf8', glowB: '#a78bfa', glow: 0.14, angle: 160 });
    expect(bg).toContain('radial-gradient(1100px 700px at 78% 18%, rgba(56, 189, 248, 0.14)');
    expect(bg).toContain('radial-gradient(900px 640px at 12% 82%, rgba(167, 139, 250, 0.119)');
    expect(bg).toContain('linear-gradient(160deg, #10141c, #0a0d12 75%)');
  });

  it('draftFromTheme round-trips through deriveTheme (same look back)', () => {
    const t = deriveTheme({ paper: '#0b1a26', text: '#e4f2fa', dim: '#90b1c5', accent: '#22d3ee', chromeA: 0.82, lineA: 0.1 });
    const d = draftFromTheme({ ...t, accent: '#22d3ee' });
    const t2 = deriveTheme(d);
    expect(t2.paper).toBe(t.paper);
    expect(t2.text).toBe(t.text);
    expect(t2.dim).toBe(t.dim);
    expect(t2.chrome).toBe(t.chrome);
    expect(t2.line).toBe(t.line);
  });
});

describe('user theme store', () => {
  const good = { id: 'u-ink', name: 'Ink', paper: '#111111', text: '#eeeeee', dim: '#999999', accent: '#f87171' };

  it('normalizeUserTheme validates, canonicalizes and rejects garbage', () => {
    const n = normalizeUserTheme({ ...good, paper: '#ABC', chromeA: 9, glowA: '', angle: 400 });
    expect(n).toMatchObject({ id: 'u-ink', name: 'Ink', paper: '#aabbcc', chromeA: 0.98, angle: 360 });
    expect(n.glowA).toBe('#f87171'); // glow falls back to the accent
    expect(normalizeUserTheme({ ...good, id: 'Bad Id!' })).toBeNull();
    expect(normalizeUserTheme({ ...good, name: '  ' })).toBeNull();
    expect(normalizeUserTheme({ ...good, paper: 'not-a-color' })).toBeNull();
    expect(normalizeUserTheme(null)).toBeNull();
    expect(normalizeUserTheme('theme')).toBeNull();
  });

  it('upsert replaces by id without mutating; remove filters', () => {
    const a = { ...good };
    const b = { ...good, name: 'Ink 2' };
    const list = upsertTheme([a], b);
    expect(list).toHaveLength(1);
    expect(list[0]).toBe(b);
    expect(a.name).toBe('Ink'); // original untouched
    expect(removeTheme(list, 'u-ink')).toHaveLength(0);
    expect(list).toHaveLength(1); // and the source list is intact
  });

  it('newThemeId slugs names and dedupes with -2, -3, …', () => {
    expect(newThemeId('Deep Ocean!')).toBe('u-deep-ocean');
    expect(newThemeId('Ink', ['u-ink'])).toBe('u-ink-2');
    expect(newThemeId('Ink', ['u-ink', 'u-ink-2'])).toBe('u-ink-3');
    expect(newThemeId('///')).toBe('u-theme');
    expect(newThemeId('x'.repeat(80))).toBe(`u-${'x'.repeat(24)}`);
  });

  it('resolveTheme prefers the user theme, then presets, then midnight', () => {
    const u = normalizeUserTheme(good);
    expect(resolveTheme('u-ink', [u]).paper).toBe('#111111');
    expect(resolveTheme('ocean', [u]).label).toBe('Ocean');
    expect(resolveTheme('no-such-id', [u]).label).toBe('Midnight');
  });
});

describe('presets stay intact through the move', () => {
  it('all seven presets and the accent ramp survive the extraction', () => {
    expect(Object.keys(THEME_PRESETS).sort())
      .toEqual(['cobalt', 'forest', 'light', 'midnight', 'ocean', 'omarchy', 'sunset']);
    expect(THEME_PRESETS.midnight.label).toBe('Midnight');
    expect(ACCENTS).toHaveLength(12);
  });
});

describe('theme-pack library', () => {
  it('every pack theme clears WCAG AAA on its own paper', () => {
    for (const card of PACK_INDEX) {
      const t = deriveTheme(card.f);
      expect(contrast(t.text, t.paper), `${card.id} text on paper`).toBeGreaterThanOrEqual(7);
      expect(contrast(t.dim, t.paper), `${card.id} dim on paper`).toBeGreaterThanOrEqual(7);
      expect(contrast(t.danger, t.paper), `${card.id} danger on paper`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('derived pack chrome keeps text readable over dark and mid backdrops', () => {
    for (const card of PACK_INDEX) {
      const t = deriveTheme(card.f);
      for (const base of ['#000000', '#3a3a44']) {
        const panel = flatten(t.chrome, base);
        expect(contrast(t.text, panel), `${card.id} text on chrome(${base})`).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('the index is well-formed: unique ids, pack identity, searchable tags', () => {
    expect(PACK_INDEX).toHaveLength(THEME_PACKS.reduce((n, p) => n + p.themes.length, 0));
    expect(new Set(PACK_INDEX.map((c) => c.id)).size).toBe(PACK_INDEX.length);
    for (const c of PACK_INDEX) {
      expect(c.packName).toBeTruthy();
      expect(c.blurb).toBeTruthy();
      expect(Array.isArray(c.tags)).toBe(true);
    }
  });

  it('searchPacks filters by query and pack, case-insensitively', () => {
    expect(searchPacks('', 'all')).toHaveLength(PACK_INDEX.length);
    expect(searchPacks('', 'term').map((c) => c.id).sort())
      .toEqual(['amber', 'ice-term', 'phosphor']);
    const crt = searchPacks('crt', 'all');
    expect(crt.map((c) => c.id).sort()).toEqual(['amber', 'phosphor']);
    expect(searchPacks('LAVENDER', 'all').map((c) => c.id)).toEqual(['lavender']);
    expect(searchPacks('pack name', 'night').every((c) => c.pack === 'night')).toBe(true);
    expect(searchPacks('zz-nothing', 'all')).toHaveLength(0);
  });

  it('packToUserTheme installs as an editable, normalized user theme', () => {
    const card = PACK_INDEX[0];
    const rec = normalizeUserTheme(packToUserTheme(card));
    expect(rec).not.toBeNull();
    expect(rec.id).toBe(`u-${card.pack}-${card.id}`);
    const t = deriveTheme(rec);
    const direct = deriveTheme(card.f);
    expect(t.paper).toBe(direct.paper);
    expect(t.bg).toBe(direct.bg); // installing renders exactly the card preview
  });
});
