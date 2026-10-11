// The wallpaper compositor core (os/wpcompose.js): spec normalization is
// the security boundary for stored data (clamp or drop, never throw), the
// layer CSS is what the desktop and the studio preview both render, and
// float styling keeps scale OUT of the keyframes. Pure module — direct
// function tests.
import { describe, it, expect } from 'vitest';
import {
  normalizeComposite, upsertComposite, removeComposite, newCompositeId,
  compositeLayers, floatStyles,
  BASE_KINDS, PATTERN_KINDS, EFFECT_KINDS, FLOAT_ANIMS, MAX_FLOATS,
} from '../src/os/wpcompose.js';

const validBase = {
  kind: 'gradient', angle: 200,
  stops: [{ color: '#38bdf8', at: 60 }, { color: '#0b0e14', at: 10 }],
};
const valid = {
  id: 'wp-dawn', name: 'Dawn',
  base: validBase,
  pattern: { kind: 'dots', size: 40, color: '#ffffff', opacity: 0.1 },
  effect: { kind: 'vignette', strength: 0.6, color: '#38bdf8' },
  floats: [{
    id: 'fl-1', image: 'https://x.example/f.png', x: 70, y: 30,
    scale: 1.4, opacity: 0.8, anim: 'drift', speed: 1.5,
  }],
};

describe('normalizeComposite', () => {
  it('canonicalizes a valid spec and sorts gradient stops by position', () => {
    const c = normalizeComposite(valid);
    expect(c).toEqual({
      id: 'wp-dawn', name: 'Dawn',
      base: {
        kind: 'gradient', angle: 200,
        stops: [{ color: '#0b0e14', at: 10 }, { color: '#38bdf8', at: 60 }],
      },
      pattern: { kind: 'dots', size: 40, color: '#ffffff', opacity: 0.1 },
      effect: { kind: 'vignette', strength: 0.6, color: '#38bdf8' },
      floats: [valid.floats[0]],
    });
  });

  it('rejects unusable rows: missing id, bad id shape, blank name, non-objects', () => {
    expect(normalizeComposite(null)).toBeNull();
    expect(normalizeComposite('wp-dawn')).toBeNull();
    expect(normalizeComposite({ ...valid, id: '' })).toBeNull();
    expect(normalizeComposite({ ...valid, id: 'Not Valid!' })).toBeNull();
    expect(normalizeComposite({ ...valid, name: '   ' })).toBeNull();
  });

  it('trims and caps the name, clamps every knob into range', () => {
    const c = normalizeComposite({
      ...valid,
      name: `X${'y'.repeat(60)}`,
      base: { kind: 'gradient', angle: 999, stops: [{ color: 'zzz', at: -20 }, { color: '#ff0000', at: 400 }] },
      pattern: { kind: 'dots', size: 9999, color: 'nope', opacity: 9 },
      effect: { kind: 'glow', strength: 42, color: '' },
      floats: [{ ...valid.floats[0], x: 150, y: -8, scale: 99, opacity: 5, speed: 0.01 }],
    });
    expect(c.name).toHaveLength(40);
    expect(c.base.angle).toBe(360);
    expect(c.base.stops[0]).toEqual({ color: '#38bdf8', at: 0 }); // garbage color falls back to accent
    expect(c.base.stops[1].at).toBe(100);
    expect(c.pattern.size).toBe(160);
    expect(c.pattern.color).toBe('#ffffff'); // pattern default
    expect(c.pattern.opacity).toBe(0.5);
    expect(c.effect.strength).toBe(1);
    expect(c.effect.color).toBe('#38bdf8'); // effect default
    expect(c.floats[0]).toMatchObject({ x: 100, y: 0, scale: 3, opacity: 1, speed: 0.25 });
  });

  it('unknown kinds fall back to none / theme, never break rendering', () => {
    const c = normalizeComposite({
      ...valid,
      base: { kind: 'hologram' },
      pattern: { kind: 'plaid' },
      effect: { kind: 'lensflare' },
    });
    expect(c.base).toEqual({ kind: 'theme' });
    expect(c.pattern).toEqual({ kind: 'none' });
    expect(c.effect).toEqual({ kind: 'none' });
  });

  it('an image base sanitizes and falls back to theme when missing/oversized', () => {
    const ok = normalizeComposite({
      ...valid, base: { kind: 'image', image: 'data:image/png;base64,AAA' },
    });
    expect(ok.base).toEqual({ kind: 'image', image: 'data:image/png;base64,AAA' });
    expect(normalizeComposite({ ...valid, base: { kind: 'image', image: 'javascript:alert(1)' } }).base)
      .toEqual({ kind: 'theme' });
    const big = 'data:image/png;base64,' + 'A'.repeat(2_500_000);
    expect(normalizeComposite({ ...valid, base: { kind: 'image', image: big } }).base)
      .toEqual({ kind: 'theme' });
  });

  it('a gradient with too few usable stops gets the default pair', () => {
    const c = normalizeComposite({ ...valid, base: { kind: 'gradient', stops: [{ color: '#111111', at: 50 }] } });
    expect(c.base.stops).toEqual([{ color: '#38bdf8', at: 0 }, { color: '#0b0e14', at: 100 }]);
  });

  it('drops floats without usable images and caps the float count', () => {
    const c = normalizeComposite({
      ...valid,
      floats: [
        { id: 'aa', image: 'not a url' },
        { id: 'bb', image: 'https://x.example/ok.png' },
        null,
        { id: 'cc', image: 'data:text/html,x' },
        { image: 'https://x.example/noid.png' },
        { id: 'dd', image: `data:image/png;base64,${'A'.repeat(1_100_000)}` },
      ],
    });
    expect(c.floats.map((f) => f.id)).toEqual(['bb', 'fl-5']); // usable + id from the raw index
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: `f${i}`, image: `https://x.example/${i}.png`,
    }));
    expect(normalizeComposite({ ...valid, floats: many }).floats).toHaveLength(MAX_FLOATS);
  });

  it('a spec over the storage guard is rejected outright', () => {
    const huge = {
      ...valid,
      floats: Array.from({ length: MAX_FLOATS }, (_, i) => ({
        id: `f${i}`, image: `data:image/png;base64,${'A'.repeat(900_000)}`,
      })),
    };
    expect(normalizeComposite(huge)).toBeNull();
  });
});

describe('list ops + ids', () => {
  it('upsert replaces by id (appended, like upsertTheme); remove filters; both pure', () => {
    const a = { ...valid };
    const b = { ...valid, id: 'wp-other' };
    const list = [a, b];
    const next = upsertComposite(list, { ...a, name: 'Dawn 2' });
    expect(next).toHaveLength(2);
    expect(next.map((x) => x.id)).toEqual(['wp-other', 'wp-dawn']); // replaced at the end
    expect(next[1].name).toBe('Dawn 2');
    expect(list[0].name).toBe('Dawn'); // original untouched
    expect(removeComposite(next, 'wp-dawn').map((x) => x.id)).toEqual(['wp-other']);
    expect(next).toHaveLength(2);
  });

  it('newCompositeId slugs, dedupes with -2/-3 and falls back on garbage', () => {
    expect(newCompositeId('My Wallpaper!')).toBe('wp-my-wallpaper');
    expect(newCompositeId('Dawn', ['wp-dawn'])).toBe('wp-dawn-2');
    expect(newCompositeId('Dawn', ['wp-dawn', 'wp-dawn-2'])).toBe('wp-dawn-3');
    expect(newCompositeId('   ')).toBe('wp-wallpaper');
    expect(newCompositeId('X'.repeat(80))).toMatch(/^wp-x{24}$/);
  });
});

describe('compositeLayers', () => {
  it('builds the gradient base from sorted stops with the angle', () => {
    const l = compositeLayers(valid);
    expect(l.base).toBe('linear-gradient(200deg, #0b0e14 10%, #38bdf8 60%)');
  });

  it('color / image / theme bases render their idioms', () => {
    expect(compositeLayers({ ...valid, base: { kind: 'color', color: '#123456' } }).base).toBe('#123456');
    expect(compositeLayers({ ...valid, base: { kind: 'image', image: 'https://x.example/a"b.png' } }).base)
      .toBe('url("https://x.example/a%22b.png") center / cover no-repeat fixed');
    const l = compositeLayers({ ...valid, base: { kind: 'theme' } }, 'THEME_BG');
    expect(l.base).toBe('THEME_BG');
    expect(compositeLayers({ ...valid, base: { kind: 'theme' } }).base).toBe('#10141c'); // no theme bg → house paper
  });

  it('each pattern kind emits its CSS idiom; none emits nothing', () => {
    const pats = {
      dots: 'radial-gradient(rgba(255, 255, 255, 0.1) 3.6px, transparent 4.1px) 0 0 / 40px 40px',
      grid: 'repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.1) 0 1px, transparent 1px 40px)',
      stripes: 'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.1) 0 10px, transparent 10px 20px)',
      checker: 'repeating-conic-gradient(rgba(255, 255, 255, 0.1) 0% 25%, transparent 0% 50%) 0 0 / 40px 40px',
      diagonal: 'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.1) 0 1px, transparent 1px 40px)',
    };
    for (const [kind, expected] of Object.entries(pats)) {
      expect(compositeLayers({ ...valid, pattern: { kind, size: 40, color: '#ffffff', opacity: 0.1 } }).pattern)
        .toContain(expected);
    }
    expect(compositeLayers({ ...valid, pattern: { kind: 'cross', size: 40, color: '#ffffff', opacity: 0.1 } }).pattern)
      .toMatch(/^repeating-linear-gradient\(0deg.*90deg.*45deg/); // grid + diagonal
    expect(compositeLayers({ ...valid, pattern: { kind: 'none' } }).pattern).toBe('');
  });

  it('effects derive strength into the layer; grain ships the in-code SVG tile', () => {
    expect(compositeLayers(valid).effectCss)
      .toContain('rgba(5, 8, 12, 0.432)'); // 0.72 × 0.6 vignette corner
    expect(compositeLayers({ ...valid, effect: { kind: 'glow', strength: 0.5, color: '#38bdf8' } }).effectCss)
      .toContain('rgba(56, 189, 248, 0.2)');
    expect(compositeLayers({ ...valid, effect: { kind: 'scanlines', strength: 1, color: '#000000' } }).effectCss)
      .toContain('repeating-linear-gradient(0deg, rgba(4, 6, 10, 0.300) 0 1px');
    const grain = compositeLayers({ ...valid, effect: { kind: 'grain', strength: 0.4, color: '#000000' } });
    expect(grain.effectCss).toContain('data:image/svg+xml');
    expect(grain.effectOpacity).toBe(0.4); // grain fades via layer opacity
    expect(compositeLayers({ ...valid, effect: { kind: 'none' } }).effectCss).toBe('');
  });

  it('garbage input falls back to a safe composite instead of throwing', () => {
    const l = compositeLayers(null);
    expect(l.base).toBe('#10141c');
    expect(l.pattern).toBe('');
    expect(l.effectCss).toBe('');
    expect(l.spec.id).toBe('wp-fallback');
  });
});

describe('floatStyles', () => {
  it('places the box by percent and carries scale in the static transform', () => {
    const st = floatStyles({ x: 25, y: 80, scale: 1.5, opacity: 0.6, speed: 1.5 });
    expect(st.box).toEqual({
      left: '25%', top: '80%', opacity: 0.6,
      transform: 'translate(-50%, -50%) scale(1.5)',
    });
    expect(st.img).toEqual({ animationDuration: '12s' }); // 18 / 1.5
  });

  it('duration follows speed and rounds to one decimal', () => {
    expect(floatStyles({ x: 0, y: 0, scale: 1, opacity: 1, speed: 0.25 }).img.animationDuration).toBe('72s');
    expect(floatStyles({ x: 0, y: 0, scale: 1, opacity: 1, speed: 3 }).img.animationDuration).toBe('6s');
  });
});

describe('kind registries', () => {
  it('expose the chip surface the studio renders', () => {
    expect(BASE_KINDS).toEqual(['theme', 'color', 'gradient', 'image']);
    expect(PATTERN_KINDS).toEqual(['none', 'dots', 'grid', 'stripes', 'checker', 'diagonal', 'cross']);
    expect(EFFECT_KINDS).toEqual(['none', 'vignette', 'glow', 'scanlines', 'grain']);
    expect(FLOAT_ANIMS).toEqual(['none', 'float', 'drift', 'pulse', 'spin']);
    expect(MAX_FLOATS).toBe(4);
  });
});
