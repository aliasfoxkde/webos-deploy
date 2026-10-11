/* Theme model: color math (WCAG), the preset registry, user themes and the
   theme-pack library. Pure — no React, no DOM — so the AAA gates run in
   unit tests and the Settings builder previews from the same functions the
   OS renders with.

   A USER THEME stores the editable draft fields (paper/text/dim/accent +
   chrome/line/glow/angle knobs); deriveTheme() expands them into the full
   token set deterministically, so what the editor shows is exactly what
   the desktop renders. Pack themes are curated drafts that install into
   the user's collection and stay editable afterwards. */

/* ---------- WCAG 2.x color math (kept in sync with tests/theme-math.js) ---------- */

/* Relative luminance of a #rrggbb color. */
export const luminance = (hex) => {
  const c = String(hex).replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/* Contrast ratio between two #rrggbb colors. */
export const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/* Flatten 'rgba(r, g, b, a)' over an opaque base → #rrggbb (opaque inputs
   pass through). Used to measure chrome against text the way it composites. */
export function flatten(color, base) {
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(String(color));
  if (!m) return color;
  const [, r, g, b, a] = m;
  const bc = hexToRgb(base);
  const mixCh = (s, i) => Math.round(Number(s) * Number(a) + bc[i] * (1 - Number(a)));
  return `#${[mixCh(r, 0), mixCh(g, 1), mixCh(b, 2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/* ---------- small color utilities ---------- */

const hexToRgb = (hex) => String(hex).replace('#', '').match(/../g).map((h) => parseInt(h, 16));

/* Normalize to #rrggbb; 3-digit forms expand, garbage falls back. */
export function normHex(hex, fallback = '#000000') {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
  return `#${h.toLowerCase()}`;
}

export const rgba = (hex, a) => {
  const [r, g, b] = hexToRgb(normHex(hex));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(Math.max(0, Math.min(1, a)) * 1000) / 1000})`;
};

/* Linear mix of two hex colors, t=0 → a. */
export function mix(a, b, t) {
  const [ca, cb] = [hexToRgb(a), hexToRgb(b)];
  return `#${ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));

/* Light papers take dark dangers/focus rings; dark papers the reverse.
   Threshold sits between the darkest light paper and the brightest dark one. */
export const isLight = (paper) => luminance(normHex(paper)) > 0.35;

/* ---------- derivation ---------- */

/* The house background idiom: two accent-tinted glows over a paper→shadow
   linear ramp. Same shape the built-in presets are hand-written in. */
export function compositeBg({ paper, glowA, glowB, glow = 0.14, angle = 160 }) {
  const end = isLight(paper) ? mix(paper, '#ffffff', 0.06) : mix(paper, '#000000', 0.35);
  return 'radial-gradient(1100px 700px at 78% 18%, '
    + `${rgba(glowA, glow)}, transparent 60%), `
    + `radial-gradient(900px 640px at 12% 82%, ${rgba(glowB, glow * 0.85)}, transparent 60%), `
    + `linear-gradient(${Math.round(angle)}deg, ${paper}, ${end} 75%)`;
}

/* Expand editable draft fields into the complete token set a theme needs.
   Every knob is clamped; missing/garbage fields fall back to the Midnight
   defaults, so a half-written custom theme can never render broken CSS. */
export function deriveTheme(f = {}) {
  const paper = normHex(f.paper, '#10141c');
  const text = normHex(f.text, '#e8ecf4');
  const dim = normHex(f.dim, '#9fa9ba');
  const accent = normHex(f.accent, '#38bdf8');
  const chromeA = clamp(f.chromeA ?? 0.84, 0.5, 0.98);
  const lineA = clamp(f.lineA ?? 0.12, 0.04, 0.3);
  const glow = clamp(f.glow ?? 0.14, 0, 0.35);
  const angle = clamp(f.angle ?? 160, 0, 360);
  const light = isLight(paper);
  return {
    paper,
    text,
    dim,
    accent,
    chrome: rgba(paper, chromeA),
    line: rgba(text, lineA),
    danger: light ? '#991b1b' : '#fca5a5',
    focus: rgba(text, light ? 0.8 : 0.45),
    bg: compositeBg({
      paper,
      glowA: normHex(f.glowA, accent),
      glowB: normHex(f.glowB, accent),
      glow,
      angle,
    }),
  };
}

/* Pull editable draft fields back out of a resolved token set (used when
   "New theme" starts from the active theme's look). */
export function draftFromTheme(t) {
  const alpha = (color, dflt) => {
    const m = /rgba\([^)]*,\s*([\d.]+)\)/.exec(String(color));
    return m ? Number(m[1]) : dflt;
  };
  return {
    paper: normHex(t.paper, '#10141c'),
    text: normHex(t.text, '#e8ecf4'),
    dim: normHex(t.dim, '#9fa9ba'),
    accent: normHex(t.accent, '#38bdf8'),
    chromeA: alpha(t.chrome, 0.84),
    lineA: alpha(t.line, 0.12),
    glowA: normHex(t.accent, '#38bdf8'),
    glowB: normHex(t.accent, '#38bdf8'),
    glow: 0.14,
    angle: 160,
  };
}

/* ---------- user themes (persisted under the 'userthemes' key) ---------- */

/* Validate + canonicalize one stored theme; null when unusable (never
   throw — stored data is hostile input, a bad row drops, the rest load). */
export function normalizeUserTheme(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && /^[a-z0-9-]{2,48}$/.test(raw.id) ? raw.id : '';
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '';
  if (!id || !name) return null;
  if (raw.paper && !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(raw.paper))) return null;
  return {
    id,
    name,
    paper: normHex(raw.paper, '#10141c'),
    text: normHex(raw.text, '#e8ecf4'),
    dim: normHex(raw.dim, '#9fa9ba'),
    accent: normHex(raw.accent, '#38bdf8'),
    chromeA: clamp(raw.chromeA ?? 0.84, 0.5, 0.98),
    lineA: clamp(raw.lineA ?? 0.12, 0.04, 0.3),
    glowA: normHex(raw.glowA, normHex(raw.accent, '#38bdf8')),
    glowB: normHex(raw.glowB, normHex(raw.accent, '#38bdf8')),
    glow: clamp(raw.glow ?? 0.14, 0, 0.35),
    angle: clamp(raw.angle ?? 160, 0, 360),
  };
}

export const upsertTheme = (list, t) => [...list.filter((x) => x.id !== t.id), t];
export const removeTheme = (list, id) => list.filter((t) => t.id !== id);

/* Unique user-theme id from a name: slug first, then -2, -3, … */
export function newThemeId(name, taken = []) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'theme';
  const set = new Set(taken);
  if (!set.has(`u-${slug}`)) return `u-${slug}`;
  let n = 2;
  while (set.has(`u-${slug}-${n}`)) n += 1;
  return `u-${slug}-${n}`;
}

/* Resolve a preset-or-user-theme id to a full token set: user themes are
   drafts that derive on the fly; unknown ids fall back to Midnight. */
export function resolveTheme(presetId, userThemes = [], presets) {
  const u = userThemes.find((t) => t.id === presetId);
  if (u) return deriveTheme(u);
  const p = presets || THEME_PRESETS;
  return p[presetId] || p.midnight;
}

/* ---------- theme presets ---------- */

export const ACCENTS = ['#38bdf8', '#22d3ee', '#34d399', '#a3e635', '#fbbf24', '#fb923c', '#f87171', '#f472b6', '#e879f9', '#a78bfa', '#818cf8', '#60a5fa'];

export const THEME_PRESETS = {
  midnight: {
    paper: '#10141c',
    label: 'Midnight', text: '#e8ecf4', dim: '#9fa9ba', chrome: 'rgba(16,20,30,0.82)', line: 'rgba(255,255,255,0.09)',
    danger: '#fca5a5', focus: 'rgba(232,236,244,0.45)',
    bg: 'radial-gradient(1100px 700px at 78% 18%, rgba(56,189,248,0.14), transparent 60%), radial-gradient(900px 640px at 12% 82%, rgba(167,139,250,0.12), transparent 60%), radial-gradient(700px 500px at 45% 45%, rgba(52,211,153,0.05), transparent 60%), linear-gradient(160deg, #0d1220, #07090d 70%)',
  },
  ocean: {
    paper: '#0b1a26',
    label: 'Ocean', text: '#e4f2fa', dim: '#90b1c5', chrome: 'rgba(10,26,40,0.82)', line: 'rgba(255,255,255,0.10)',
    danger: '#fca5a5', focus: 'rgba(228,242,250,0.45)',
    bg: 'radial-gradient(1000px 700px at 20% 15%, rgba(34,211,238,0.16), transparent 60%), radial-gradient(900px 700px at 85% 85%, rgba(59,130,246,0.18), transparent 60%), linear-gradient(165deg, #06202e, #030b13 75%)',
  },
  forest: {
    paper: '#0c1810',
    label: 'Forest', text: '#eaf5ea', dim: '#9db8a0', chrome: 'rgba(14,28,20,0.84)', line: 'rgba(255,255,255,0.09)',
    danger: '#fca5a5', focus: 'rgba(234,245,234,0.45)',
    bg: 'radial-gradient(1000px 700px at 75% 20%, rgba(52,211,153,0.13), transparent 60%), radial-gradient(900px 650px at 15% 85%, rgba(163,230,53,0.08), transparent 60%), linear-gradient(160deg, #0a1a12, #050b07 75%)',
  },
  sunset: {
    paper: '#170e0b',
    label: 'Sunset', text: '#fdf0e7', dim: '#c9a68f', chrome: 'rgba(32,18,14,0.84)', line: 'rgba(255,255,255,0.10)',
    danger: '#fca5a5', focus: 'rgba(253,240,231,0.45)',
    bg: 'radial-gradient(1100px 700px at 80% 80%, rgba(251,146,60,0.20), transparent 60%), radial-gradient(900px 600px at 15% 15%, rgba(244,114,182,0.14), transparent 55%), linear-gradient(160deg, #1d0f0a, #0b0505 75%)',
  },
  light: {
    paper: '#f7f9fc',
    label: 'Daylight', text: '#1a2230', dim: '#314156', chrome: 'rgba(250,251,253,0.86)', line: 'rgba(15,25,40,0.12)',
    danger: '#991b1b', focus: 'rgba(26,34,48,0.8)',
    bg: 'radial-gradient(1100px 700px at 78% 18%, rgba(96,165,250,0.18), transparent 60%), radial-gradient(900px 640px at 12% 82%, rgba(167,139,250,0.14), transparent 60%), linear-gradient(160deg, #eef2f8, #dde4ee 75%)',
  },
  /* Tokyo Night family — text/dim verified ≥ 7:1 (AAA) on their dark bases;
     the accent-tinted `line` is decorative chrome (≥ 3:1 not required). */
  omarchy: {
    paper: '#16161e',
    label: 'Omarchy', text: '#c0caf5', dim: '#a9b1d6', chrome: 'rgba(26,27,38,0.92)', line: 'rgba(122,162,247,0.16)',
    danger: '#fca5a5', focus: 'rgba(192,202,245,0.5)',
    bg: 'radial-gradient(1100px 700px at 80% 12%, rgba(122,162,247,0.12), transparent 60%), radial-gradient(900px 640px at 10% 85%, rgba(187,154,247,0.10), transparent 60%), linear-gradient(160deg, #1a1b26, #101017 75%)',
  },
  cobalt: {
    paper: '#0c1120',
    label: 'Cobalt', text: '#d6e2ff', dim: '#93a8ce', chrome: 'rgba(10,14,28,0.90)', line: 'rgba(167,139,250,0.16)',
    danger: '#fca5a5', focus: 'rgba(214,226,255,0.5)',
    bg: 'radial-gradient(1000px 700px at 75% 20%, rgba(167,139,250,0.14), transparent 60%), radial-gradient(900px 650px at 15% 80%, rgba(96,165,250,0.10), transparent 60%), linear-gradient(160deg, #0e1428, #070a14 75%)',
  },
};

/* ---------- theme-pack library ----------
   Curated, original palettes. Each entry is an editable DRAFT (the same
   shape the builder produces); contrast discipline is enforced by test:
   text and dim ≥ 7:1 on paper (WCAG AAA), danger ≥ 4.5:1. Installing a
   pack theme copies it into the user's themes — nothing references the
   library at render time, so edits stick. */

export const THEME_PACKS = [
  {
    id: 'night', name: 'Night Lights', blurb: 'Deep darks with one glowing hue',
    themes: [
      { id: 'aurora', name: 'Aurora', tags: ['green', 'teal', 'dark'],
        f: { paper: '#0a1410', text: '#e7f6ec', dim: '#a3c4b0', accent: '#34d399', glowA: '#34d399', glowB: '#a3e635', glow: 0.15 } },
      { id: 'neon', name: 'Neon District', tags: ['pink', 'cyber', 'dark'],
        f: { paper: '#0b0b12', text: '#f2eefb', dim: '#b0abc7', accent: '#e879f9', glowA: '#e879f9', glowB: '#22d3ee', glow: 0.16 } },
      { id: 'ember', name: 'Ember', tags: ['warm', 'orange', 'dark'],
        f: { paper: '#140d0a', text: '#fbeee6', dim: '#cfa894', accent: '#fb923c', glowA: '#fb923c', glowB: '#f87171', glow: 0.17 } },
      { id: 'glacier', name: 'Glacier', tags: ['blue', 'ice', 'dark'],
        f: { paper: '#0c1620', text: '#e8f4fb', dim: '#9fc1d4', accent: '#7dd3fc', glowA: '#38bdf8', glowB: '#818cf8', glow: 0.14 } },
    ],
  },
  {
    id: 'day', name: 'Day Workspaces', blurb: 'Light themes for bright rooms',
    themes: [
      { id: 'paperwhite', name: 'Paperwhite', tags: ['minimal', 'light', 'white'],
        f: { paper: '#fafafa', text: '#1c1c1c', dim: '#4b4b4b', accent: '#2563eb', glowA: '#93c5fd', glowB: '#c4b5fd', glow: 0.2 } },
      { id: 'sand', name: 'Sand', tags: ['warm', 'light', 'cream'],
        f: { paper: '#f7f1e5', text: '#33302a', dim: '#514b41', accent: '#b45309', glowA: '#fcd34d', glowB: '#fda4af', glow: 0.22 } },
      { id: 'mint', name: 'Mint Office', tags: ['green', 'light', 'fresh'],
        f: { paper: '#eff5f0', text: '#1d2b22', dim: '#3c4d42', accent: '#059669', glowA: '#6ee7b7', glowB: '#a5f3fc', glow: 0.2 } },
      { id: 'blueprint', name: 'Blueprint', tags: ['blue', 'light', 'cool'],
        f: { paper: '#e8eef5', text: '#16233a', dim: '#354661', accent: '#1d4ed8', glowA: '#93c5fd', glowB: '#a5b4fc', glow: 0.22 } },
    ],
  },
  {
    id: 'term', name: 'Terminals', blurb: 'Phosphor glow, CRT warmth',
    themes: [
      { id: 'phosphor', name: 'Phosphor', blurb: 'Green phosphor CRT glow', tags: ['green', 'crt', 'terminal'],
        f: { paper: '#050a05', text: '#d2fbd2', dim: '#8fc98f', accent: '#4ade80', glowA: '#22c55e', glowB: '#065f46', glow: 0.18 } },
      { id: 'amber', name: 'Amber CRT', blurb: 'Warm amber phosphor', tags: ['amber', 'crt', 'terminal'],
        f: { paper: '#0c0803', text: '#fde9c8', dim: '#d4b48c', accent: '#fbbf24', glowA: '#f59e0b', glowB: '#7c2d12', glow: 0.19 } },
      { id: 'ice-term', name: 'Ice Terminal', blurb: 'Cool cyan console', tags: ['cyan', 'terminal', 'cool'],
        f: { paper: '#0b1214', text: '#e2f3f5', dim: '#a3c6cb', accent: '#67e8f9', glowA: '#22d3ee', glowB: '#3b82f6', glow: 0.16 } },
    ],
  },
  {
    id: 'soft', name: 'Soft Tones', blurb: 'Muted darks, gentle hues',
    themes: [
      { id: 'lavender', name: 'Lavender Dusk', tags: ['purple', 'soft', 'dark'],
        f: { paper: '#17141f', text: '#f0ecf8', dim: '#b6add0', accent: '#a78bfa', glowA: '#8b5cf6', glowB: '#f472b6', glow: 0.13 } },
      { id: 'sage', name: 'Sage', tags: ['green', 'muted', 'dark'],
        f: { paper: '#131711', text: '#eef2ea', dim: '#adc0a8', accent: '#84cc16', glowA: '#65a30d', glowB: '#14b8a6', glow: 0.12 } },
      { id: 'rosewood', name: 'Rosewood', tags: ['red', 'soft', 'dark'],
        f: { paper: '#1c1013', text: '#fbeef1', dim: '#d0a8b4', accent: '#fb7185', glowA: '#f43f5e', glowB: '#9f1239', glow: 0.13 } },
    ],
  },
];

/* Flat cards for the library UI: theme + its pack identity. */
export const PACK_INDEX = THEME_PACKS.flatMap((p) => p.themes.map((t) => ({
  ...t,
  pack: p.id,
  packName: p.name,
  blurb: t.blurb || p.blurb,
})));

/* Library search: name, pack name, blurb and tags, optionally scoped to
   one pack. Case-insensitive substring — same contract as the wallpaper
   search in Settings. */
export function searchPacks(query = '', packId = 'all') {
  const needle = query.trim().toLowerCase();
  return PACK_INDEX.filter((c) => (packId === 'all' || c.pack === packId)
    && (!needle
      || `${c.name} ${c.packName} ${c.blurb} ${(c.tags || []).join(' ')}`
        .toLowerCase()
        .includes(needle)));
}

/* Install a pack theme as an editable user theme (id stable per pack
   theme, so re-installing after an edit refreshes in place). */
export function packToUserTheme(card) {
  return { id: `u-${card.pack}-${card.id}`, name: card.name, ...card.f };
}
