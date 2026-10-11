/* Wallpaper compositor model: a composite wallpaper is a LAYERED spec —
   base (theme gradient / solid color / multi-stop gradient / image), a
   pattern overlay, an effect overlay, and up to four floating images with
   position / scale / transparency / animation. Pure — no React, no DOM —
   so the Settings studio previews from the same functions the desktop
   renders with, and hostile stored specs can never produce broken CSS
   (everything clamps or drops, nothing throws). */

import { normHex, rgba } from './themes.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));

export const BASE_KINDS = ['theme', 'color', 'gradient', 'image'];
export const PATTERN_KINDS = ['none', 'dots', 'grid', 'stripes', 'checker', 'diagonal', 'cross'];
export const EFFECT_KINDS = ['none', 'vignette', 'glow', 'scanlines', 'grain'];
export const FLOAT_ANIMS = ['none', 'float', 'drift', 'pulse', 'spin'];
export const MAX_FLOATS = 4;

/* Storage guards: composite specs live in localStorage next to the theme,
   so image payloads are capped (data-URL characters ≈ 4/3 × binary bytes;
   the Settings upload inputs enforce the matching file-size limits). */
const MAX_BASE_CHARS = 2_400_000;  // base image ≈ ≤ 1.75 MB binary
const MAX_FLOAT_CHARS = 1_000_000; // float images ≈ ≤ 730 KB binary
const MAX_SPEC_CHARS = 3_500_000;  // whole-spec guard — over this, drop it

const isImgRef = (s) => typeof s === 'string' && (/^https?:\/\//.test(s) || /^data:image\//.test(s));

/* Grain is drawn in code: an SVG feTurbulence tile, shipped as a data URI
   (no external assets, clean-room by construction). */
const GRAIN_CSS = 'url("data:image/svg+xml,'
  + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">'
    + '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter>'
    + '<rect width="160" height="160" filter="url(#n)"/></svg>')
  + '")';

/* Validate + canonicalize one stored composite; null when unusable (never
   throw — stored data is hostile input, a bad row drops, the rest load). */
export function normalizeComposite(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && /^[a-z0-9-]{2,48}$/.test(raw.id) ? raw.id : '';
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '';
  if (!id || !name) return null;

  /* base — an image that is missing/oversized falls back to the theme
     gradient rather than rejecting the whole composite */
  const kind = BASE_KINDS.includes(raw.base?.kind) ? raw.base.kind : 'theme';
  const base = { kind };
  if (kind === 'color') {
    base.color = normHex(raw.base?.color, '#10141c');
  } else if (kind === 'gradient') {
    base.angle = clamp(raw.base?.angle ?? 160, 0, 360);
    const stops = (Array.isArray(raw.base?.stops) ? raw.base.stops : [])
      .map((s) => ({ color: normHex(s?.color, '#38bdf8'), at: clamp(s?.at ?? 0, 0, 100) }))
      .sort((a, b) => a.at - b.at)
      .slice(0, 6);
    base.stops = stops.length >= 2 ? stops : [{ color: '#38bdf8', at: 0 }, { color: '#0b0e14', at: 100 }];
  } else if (kind === 'image') {
    if (isImgRef(raw.base?.image) && raw.base.image.length <= MAX_BASE_CHARS) base.image = raw.base.image;
    else base.kind = 'theme';
  }

  const pk = PATTERN_KINDS.includes(raw.pattern?.kind) ? raw.pattern.kind : 'none';
  const pattern = pk === 'none' ? { kind: 'none' } : {
    kind: pk,
    size: clamp(raw.pattern?.size ?? 32, 8, 160),
    color: normHex(raw.pattern?.color, '#ffffff'),
    opacity: clamp(raw.pattern?.opacity ?? 0.1, 0.02, 0.5),
  };

  const ek = EFFECT_KINDS.includes(raw.effect?.kind) ? raw.effect.kind : 'none';
  const effect = ek === 'none' ? { kind: 'none' } : {
    kind: ek,
    strength: clamp(raw.effect?.strength ?? 0.5, 0.05, 1),
    color: normHex(raw.effect?.color, '#38bdf8'),
  };

  /* floats — a float without a usable image drops individually */
  const floats = (Array.isArray(raw.floats) ? raw.floats : [])
    .map((f, i) => {
      if (!f || typeof f !== 'object' || !isImgRef(f.image) || f.image.length > MAX_FLOAT_CHARS) return null;
      return {
        id: typeof f.id === 'string' && /^[a-z0-9-]{2,32}$/.test(f.id) ? f.id : `fl-${i + 1}`,
        image: f.image,
        x: clamp(f.x ?? 50, 0, 100),
        y: clamp(f.y ?? 50, 0, 100),
        scale: clamp(f.scale ?? 1, 0.05, 3),
        opacity: clamp(f.opacity ?? 1, 0.05, 1),
        anim: FLOAT_ANIMS.includes(f.anim) ? f.anim : 'float',
        speed: clamp(f.speed ?? 1, 0.25, 3),
      };
    })
    .filter(Boolean)
    .slice(0, MAX_FLOATS);

  const spec = { id, name, base, pattern, effect, floats };
  if (JSON.stringify(spec).length > MAX_SPEC_CHARS) return null;
  return spec;
}

export const upsertComposite = (list, c) => [...list.filter((x) => x.id !== c.id), c];
export const removeComposite = (list, id) => list.filter((c) => c.id !== id);

/* Unique composite id from a name: slug first, then -2, -3, … */
export function newCompositeId(name, taken = []) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'wallpaper';
  const set = new Set(taken);
  if (!set.has(`wp-${slug}`)) return `wp-${slug}`;
  let n = 2;
  while (set.has(`wp-${slug}-${n}`)) n += 1;
  return `wp-${slug}-${n}`;
}

/* ---------- layer CSS (the same strings the desktop renders) ---------- */

const gradientCss = (base) => `linear-gradient(${Math.round(base.angle)}deg, ${
  base.stops.map((s) => `${s.color} ${Math.round(s.at)}%`).join(', ')})`;

function patternCss(p) {
  const tint = rgba(p.color, p.opacity);
  const px = (n) => `${Math.round(n * 100) / 100}px`;
  switch (p.kind) {
    case 'dots':
      return `radial-gradient(${tint} ${px(p.size * 0.09)}, transparent ${px(p.size * 0.09 + 0.5)}) 0 0 / ${Math.round(p.size)}px ${Math.round(p.size)}px`;
    case 'grid':
      return `repeating-linear-gradient(0deg, ${tint} 0 1px, transparent 1px ${Math.round(p.size)}px), `
        + `repeating-linear-gradient(90deg, ${tint} 0 1px, transparent 1px ${Math.round(p.size)}px)`;
    case 'stripes':
      return `repeating-linear-gradient(45deg, ${tint} 0 ${px(p.size / 4)}, transparent ${px(p.size / 4)} ${px(p.size / 2)})`;
    case 'checker':
      return `repeating-conic-gradient(${tint} 0% 25%, transparent 0% 50%) 0 0 / ${Math.round(p.size)}px ${Math.round(p.size)}px`;
    case 'diagonal':
      return `repeating-linear-gradient(45deg, ${tint} 0 1px, transparent 1px ${Math.round(p.size)}px)`;
    case 'cross':
      return `repeating-linear-gradient(0deg, ${tint} 0 1px, transparent 1px ${Math.round(p.size)}px), `
        + `repeating-linear-gradient(90deg, ${tint} 0 1px, transparent 1px ${Math.round(p.size)}px), `
        + `repeating-linear-gradient(45deg, ${tint} 0 1px, transparent 1px ${Math.round(p.size)}px)`;
    default:
      return '';
  }
}

function effectCss(e) {
  const s = e.strength;
  switch (e.kind) {
    case 'vignette':
      return { css: `radial-gradient(120% 95% at 50% 45%, transparent 52%, rgba(5, 8, 12, ${(0.72 * s).toFixed(3)}) 100%)`, opacity: 1 };
    case 'glow':
      return { css: `radial-gradient(60% 50% at 50% 42%, ${rgba(e.color, 0.4 * s)}, transparent 70%)`, opacity: 1 };
    case 'scanlines':
      return { css: `repeating-linear-gradient(0deg, rgba(4, 6, 10, ${(0.3 * s).toFixed(3)}) 0 1px, transparent 1px 3px)`, opacity: 1 };
    case 'grain':
      return { css: GRAIN_CSS, opacity: s };
    default:
      return { css: '', opacity: 1 };
  }
}

/* Everything the renderer (and the studio preview) needs for one composite:
   base background, pattern layer, effect layer + opacity. themeBg is the
   ACTIVE theme's derived background — used by base kind 'theme' so a
   composite can ride the current look and follow theme changes. */
export function compositeLayers(spec, themeBg = '') {
  const c = normalizeComposite(spec) || normalizeComposite({ id: 'wp-fallback', name: 'fallback' });
  let base;
  switch (c.base.kind) {
    case 'color': base = c.base.color; break;
    case 'gradient': base = gradientCss(c.base); break;
    case 'image': base = `url("${c.base.image.replace(/"/g, '%22')}") center / cover no-repeat fixed`; break;
    default: base = themeBg || '#10141c';
  }
  const fx = effectCss(c.effect);
  return {
    spec: c,
    base,
    pattern: patternCss(c.pattern),
    effectCss: fx.css,
    effectOpacity: fx.opacity,
  };
}

/* Float placement: the outer box carries position + scale + transparency
   (static), the inner img carries only the CSS animation — so per-float
   scale never has to live inside the keyframes. */
export function floatStyles(f) {
  return {
    box: {
      left: `${f.x}%`,
      top: `${f.y}%`,
      opacity: f.opacity,
      transform: `translate(-50%, -50%) scale(${f.scale})`,
    },
    img: { animationDuration: `${Math.round((18 / f.speed) * 10) / 10}s` },
  };
}
