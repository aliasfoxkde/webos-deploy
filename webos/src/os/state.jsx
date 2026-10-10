import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { allApps, findApp, DEFAULT_APPS, APP_INDEX } from './registry.js';
import { zoneRect } from './snap.js';
import { personaOf } from './personas.js';

/* ---------- persistence helpers ---------- */
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(`webos.${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(`webos.${key}`, JSON.stringify(value)); } catch { /* private mode */ }
}

/* Factory reset: drop every webos.* key and reload (Settings → Storage and
   Settings → About share this one implementation). */
export const factoryReset = () => {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('webos.')).forEach((k) => localStorage.removeItem(k));
  } catch { /* private mode */ }
  location.reload();
};

/* One-time migration (2026-10-09): the old build preinstalled every store app.
   Anyone carrying that stale `installed` list starts clean — only defaults are
   on the desktop now, and store apps are installed deliberately. */
function loadInstalled() {
  const raw = load('installed', null);
  if (raw === null) return [];
  const known = new Set([
    'globe', 'storyweaver', 'devopsquest', 'openzenith', 'sculptgl', 'svgedit',
    'ide', 'opencad', 'sqlite', 'python', 'pyconsole', 'planly',
  ]);
  return Array.isArray(raw) ? raw.filter((id) => known.has(id)) : [];
}

/* ---------- theme presets ---------- */
export const ACCENTS = ['#38bdf8', '#22d3ee', '#34d399', '#a3e635', '#fbbf24', '#fb923c', '#f87171', '#f472b6', '#e879f9', '#a78bfa', '#818cf8', '#60a5fa'];

export const THEME_PRESETS = {
  midnight: {
    label: 'Midnight', text: '#e8ecf4', dim: '#9aa4b5', chrome: 'rgba(16,20,30,0.82)', line: 'rgba(255,255,255,0.09)',
    bg: 'radial-gradient(1100px 700px at 78% 18%, rgba(56,189,248,0.14), transparent 60%), radial-gradient(900px 640px at 12% 82%, rgba(167,139,250,0.12), transparent 60%), radial-gradient(700px 500px at 45% 45%, rgba(52,211,153,0.05), transparent 60%), linear-gradient(160deg, #0d1220, #07090d 70%)',
  },
  ocean: {
    label: 'Ocean', text: '#e4f2fa', dim: '#8fb0c4', chrome: 'rgba(10,26,40,0.82)', line: 'rgba(255,255,255,0.10)',
    bg: 'radial-gradient(1000px 700px at 20% 15%, rgba(34,211,238,0.16), transparent 60%), radial-gradient(900px 700px at 85% 85%, rgba(59,130,246,0.18), transparent 60%), linear-gradient(165deg, #06202e, #030b13 75%)',
  },
  forest: {
    label: 'Forest', text: '#eaf5ea', dim: '#9db8a0', chrome: 'rgba(14,28,20,0.84)', line: 'rgba(255,255,255,0.09)',
    bg: 'radial-gradient(1000px 700px at 75% 20%, rgba(52,211,153,0.13), transparent 60%), radial-gradient(900px 650px at 15% 85%, rgba(163,230,53,0.08), transparent 60%), linear-gradient(160deg, #0a1a12, #050b07 75%)',
  },
  sunset: {
    label: 'Sunset', text: '#fdf0e7', dim: '#c9a68f', chrome: 'rgba(32,18,14,0.84)', line: 'rgba(255,255,255,0.10)',
    bg: 'radial-gradient(1100px 700px at 80% 80%, rgba(251,146,60,0.20), transparent 60%), radial-gradient(900px 600px at 15% 15%, rgba(244,114,182,0.14), transparent 55%), linear-gradient(160deg, #1d0f0a, #0b0505 75%)',
  },
  light: {
    label: 'Daylight', text: '#1a2230', dim: '#5b6b80', chrome: 'rgba(250,251,253,0.86)', line: 'rgba(15,25,40,0.12)',
    bg: 'radial-gradient(1100px 700px at 78% 18%, rgba(96,165,250,0.18), transparent 60%), radial-gradient(900px 640px at 12% 82%, rgba(167,139,250,0.14), transparent 60%), linear-gradient(160deg, #eef2f8, #dde4ee 75%)',
  },
};

const DEFAULT_THEME = {
  preset: 'midnight', accent: '#38bdf8', wallpaper: '', dim: 1,
  // custom-image placement + adjustments (see os/wallpapers.js)
  fit: 'fill', pos: 'center center', blur: 0, bright: 1, sat: 1,
};

/* Granular interface controls (Settings → Appearance / Desktop / Taskbar).
   `radius`/`blur` of '' mean "follow the persona default" — same convention
   for the chrome knobs added in 3.1: tbSide, titleAlign, font, shadow. */
const DEFAULT_UI = { scale: 1, anim: true, transparency: 1, radius: '', blur: '', focusHover: false, tbSide: '', titleAlign: '', font: '', shadow: '' };

/* ---------- per-subsystem defaults ---------- */
const DEFAULT_TASKBAR = { position: 'bottom', align: 'left', iconSize: 'md', autohide: false, labels: true, clock24: false, showDate: true, pinned: [] };
const DEFAULT_WIDGETS = { enabled: ['weather', 'clock', 'battery', 'events', 'notes', 'storage', 'chat'] };
const DEFAULT_DESKTOP = { iconSize: 'md', gap: 'normal', sort: 'custom' };
const DEFAULT_VOLUME = { level: 0.7, muted: false };
// Screen saver: kind off|starfield|aurora|tide|mesh|rain|photos|clock,
// idle minutes until it starts, FX speed multiplier, photo seconds per slide.
const DEFAULT_SAVER = { kind: 'off', timeoutMin: 10, speed: 1, photoSecs: 8 };

// Widget ids the sidebar understands (Sidebar.jsx renders each; Settings
// toggles them). Order of `enabled` = display order.
export const WIDGET_IDS = ['weather', 'clock', 'battery', 'events', 'notes', 'storage', 'chat'];

/* -- desktop icon groups --
   An app leaving the system (uninstall / removed custom app) leaves its
   group automatically; empty groups persist until removed by the user. */
const withoutApp = (groups, appId) =>
  groups.map((g) => (g.appIds.includes(appId) ? { ...g, appIds: g.appIds.filter((x) => x !== appId) } : g));

/* ---------- reducer ---------- */
// Scale a `rgba(r,g,b,a)` chrome color's alpha by the transparency strength
// (Settings → Appearance); non-rgba colors pass through untouched.
const withAlpha = (color, f) => {
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (!m) return color;
  const parts = m[1].split(',').map((s) => s.trim());
  if (parts.length < 3) return color;
  const a = Math.min(0.98, Math.max(0.35, (parts[3] !== undefined ? parseFloat(parts[3]) : 1) * f));
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a.toFixed(3)})`;
};

const initial = () => ({
  installed: loadInstalled(),
  userApps: load('userapps', []), // custom apps added via right-click → Add app…
  persona: personaOf(load('persona', 'win')).id, // OS skin (see os/personas.js)
  theme: { ...DEFAULT_THEME, ...load('theme', {}) },
  ui: { ...DEFAULT_UI, ...load('ui', {}) },
  events: load('events', {}),
  groups: load('groups', []), // desktop icon groups: [{ id, name, appIds }]
  order: load('desktop.order', []),
  volume: { ...DEFAULT_VOLUME, ...load('volume', {}) },
  saver: { ...DEFAULT_SAVER, ...load('saver', {}) },
  widgets: { ...DEFAULT_WIDGETS, ...load('widgets', {}) },
  taskbar: { ...DEFAULT_TASKBAR, ...load('taskbar', {}) },
  desktop: { ...DEFAULT_DESKTOP, ...load('desktop', {}) },
  uiMode: load('uiMode', 'auto'), // 'auto' | 'desktop' | 'mobile'
  mobile: false, // derived at runtime, never persisted
  windows: [],
  zTop: 10,
  focused: null,
  seq: 1,
  recents: load('recents', []), // most-recently launched app ids (start menu)
});

// Settings-object actions share one code path: patch a slice + persist.
const patched = (state, key, patch) => {
  const next = { ...state[key], ...patch };
  save(key, next);
  return { ...state, [key]: next };
};

function reducer(state, action) {
  switch (action.type) {
    case 'launch': {
      const def = APP_INDEX.find((a) => a.id === action.appId);
      const recents = [action.appId, ...state.recents.filter((r) => r !== action.appId)].slice(0, 8);
      save('recents', recents);
      // Single-instance apps (mail, weather, chat backends, …) focus the
      // running window instead of opening a second one. Applies on mobile too.
      if (def?.singleInstance) {
        const exist = state.windows.find((w) => w.appId === action.appId);
        if (exist) {
          return {
            ...state,
            focused: exist.id,
            zTop: state.zTop + 1,
            windows: state.windows.map((w) => (w.id === exist.id ? { ...w, z: state.zTop + 1, min: false } : w)),
          };
        }
      }
      // Every other launch opens a NEW window — apps are multi-instance
      // (multiple terminals, two browsers side by side, …).
      const id = state.seq;
      if (state.mobile) {
        return {
          ...state,
          seq: id + 1,
          recents,
          windows: [...state.windows, { id, appId: action.appId, args: action.args, rect: { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight - 56 }, z: state.zTop + 1, min: false, max: true }],
          zTop: state.zTop + 1,
          focused: id,
        };
      }
      // First window of an app opens centred; each further window of the SAME
      // app cascades by a fixed step from the first (wraps after 7 so the
      // chain never walks off-screen). Different apps all centre.
      const peers = state.windows.filter((w) => w.appId === action.appId);
      const step = (peers.length % 7) * 28;
      const w = Math.min(def?.win?.w || 1120, window.innerWidth - 80);
      const h = Math.min(def?.win?.h || 700, window.innerHeight - 130);
      const rect = {
        x: Math.max(12, Math.round((window.innerWidth - w) / 2) + step),
        y: Math.max(12, Math.round((window.innerHeight - 52 - h) / 2) + step),
        w, h,
      };
      return {
        ...state,
        seq: id + 1,
        recents,
        windows: [...state.windows, { id, appId: action.appId, args: action.args, rect, z: state.zTop + 1, min: false, max: false }],
        zTop: state.zTop + 1,
        focused: id,
      };
    }
    case 'close':
      return { ...state, windows: state.windows.filter((w) => w.id !== action.id) };
    case 'focus': {
      const win = state.windows.find((w) => w.id === action.id);
      if (!win) return state;
      return {
        ...state,
        focused: action.id,
        zTop: state.zTop + 1,
        windows: state.windows.map((w) =>
          w.id === action.id ? { ...w, z: state.zTop + 1, min: action.unminimize ? false : w.min } : w
        ),
      };
    }
    case 'minimize': {
      const isFocused = state.focused === action.id;
      return {
        ...state,
        focused: isFocused ? null : state.focused,
        windows: state.windows.map((w) => (w.id === action.id ? { ...w, min: action.unmin ? false : !w.min } : w)),
      };
    }
    case 'toggleMax':
      // Maximizing abandons a tile (snap/pre) — restore after maximize goes
      // back to the floating rect, not the tile.
      return { ...state, windows: state.windows.map((w) => (w.id === action.id ? { ...w, max: !w.max, snap: null, pre: null } : w)) };
    case 'setRect':
      // Any manual move clears the snapped-tile flag (pre is kept so a later
      // restore can still put the window back).
      return { ...state, windows: state.windows.map((w) => (w.id === action.id ? { ...w, rect: action.rect, snap: null } : w)) };

    /* -- tiling: halves + quadrants (see os/snap.js) --
       `pre` remembers the floating rect so the window can be unsnapped back
       to it; snapping a maximized window keeps its untouched rect as pre. */
    case 'snapWin':
      return {
        ...state,
        windows: state.windows.map((w) => {
          if (w.id !== action.id || action.zone === 'top' || w.snap === action.zone) return w;
          return {
            ...w,
            max: false,
            snap: action.zone,
            pre: w.snap ? w.pre : { ...w.rect },
            rect: zoneRect(action.zone),
          };
        }),
      };
    case 'restoreWin':
      return {
        ...state,
        windows: state.windows.map((w) => (w.id === action.id ? { ...w, snap: null, pre: null, rect: w.pre || w.rect } : w)),
      };
    case 'install': {
      const installed = state.installed.includes(action.appId) ? state.installed : [...state.installed, action.appId];
      save('installed', installed);
      return { ...state, installed };
    }
    case 'uninstall': {
      const installed = state.installed.filter((id) => id !== action.appId);
      save('installed', installed);
      const taskbar = { ...state.taskbar, pinned: (state.taskbar.pinned || []).filter((id) => id !== action.appId) };
      save('taskbar', taskbar);
      const groups = withoutApp(state.groups, action.appId);
      save('groups', groups);
      return {
        ...state,
        installed,
        taskbar,
        groups,
        windows: state.windows.filter((w) => w.appId !== action.appId),
        order: state.order.filter((id) => id !== action.appId),
      };
    }

    /* -- user-created apps (right-click → Add app…) -- */
    case 'addUserApp': {
      const userApps = [...state.userApps, action.app];
      save('userapps', userApps);
      return { ...state, userApps };
    }
    case 'updateUserApp': {
      const userApps = state.userApps.map((a) => (a.id === action.app.id ? action.app : a));
      save('userapps', userApps);
      return { ...state, userApps };
    }
    case 'removeUserApp': {
      const userApps = state.userApps.filter((a) => a.id !== action.appId);
      save('userapps', userApps);
      const taskbar = { ...state.taskbar, pinned: (state.taskbar.pinned || []).filter((id) => id !== action.appId) };
      save('taskbar', taskbar);
      const groups = withoutApp(state.groups, action.appId);
      save('groups', groups);
      return {
        ...state,
        userApps,
        taskbar,
        groups,
        windows: state.windows.filter((w) => w.appId !== action.appId),
        order: state.order.filter((id) => id !== action.appId),
      };
    }

    /* -- desktop icon groups (right-click desktop → New group; drag an icon
       onto a group tile to file it there; grouped icons leave the grid) -- */
    case 'addGroup': {
      const groups = [...state.groups, action.group];
      save('groups', groups);
      return { ...state, groups, order: [...state.order, action.group.id] };
    }
    case 'renameGroup': {
      const groups = state.groups.map((g) => (g.id === action.id ? { ...g, name: action.name } : g));
      save('groups', groups);
      return { ...state, groups };
    }
    case 'removeGroup': {
      const groups = state.groups.filter((g) => g.id !== action.id);
      save('groups', groups);
      return { ...state, groups, order: state.order.filter((id) => id !== action.id) };
    }
    case 'groupAdd': {
      const groups = state.groups.map((g) =>
        (g.id === action.id && !g.appIds.includes(action.appId) ? { ...g, appIds: [...g.appIds, action.appId] } : g));
      save('groups', groups);
      return { ...state, groups };
    }
    case 'groupRemove': {
      const groups = state.groups.map((g) => (g.id === action.id ? { ...g, appIds: g.appIds.filter((a) => a !== action.appId) } : g));
      save('groups', groups);
      return { ...state, groups };
    }
    case 'setTheme': {
      const theme = { ...state.theme, ...action.patch };
      save('theme', theme);
      return { ...state, theme };
    }
    case 'addEvent': {
      const events = { ...state.events, [action.date]: [...(state.events[action.date] || []), action.text] };
      save('events', events);
      return { ...state, events };
    }
    case 'removeEvent': {
      const list = (state.events[action.date] || []).filter((_, i) => i !== action.index);
      const events = { ...state.events, [action.date]: list };
      save('events', events);
      return { ...state, events };
    }

    /* -- desktop icon order -- */
    case 'setOrder': {
      const order = action.order;
      save('desktop.order', order);
      return { ...state, order, desktop: { ...state.desktop, sort: 'custom' } };
    }
    case 'sortDesktop': {
      const byName = [...state.installed, ...DEFAULT_APPS.map((a) => a.id)]
        .map((id) => allApps(state.installed).find((a) => a.id === id))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => a.id);
      const desktop = { ...state.desktop, sort: 'name' };
      save('desktop', desktop);
      const order = [...byName, ...state.groups.map((g) => g.id)];
      save('desktop.order', order);
      return { ...state, order, desktop };
    }

    /* -- OS persona (skin via body[data-persona] + one-shot defaults) -- */
    case 'setPersona': {
      const p = personaOf(action.id);
      save('persona', p.id);
      // Defaults, not a lockdown: preset/accent/taskbar side + alignment,
      // then the user can override any of them as usual.
      const theme = { ...state.theme, preset: p.preset, accent: p.accent };
      save('theme', theme);
      const taskbar = { ...state.taskbar, position: p.taskbar, align: p.align || 'left' };
      save('taskbar', taskbar);
      return { ...state, persona: p.id, theme, taskbar };
    }

    /* -- Settings → About → "Reset look & layout": every styling surface
          back to factory, keeping apps, files, groups, events, pins -- */
    case 'resetLook': {
      const theme = { ...DEFAULT_THEME };
      const ui = { ...DEFAULT_UI };
      const taskbar = { ...DEFAULT_TASKBAR, pinned: state.taskbar.pinned };
      const desktop = { ...DEFAULT_DESKTOP };
      const widgets = { ...DEFAULT_WIDGETS };
      const volume = { ...DEFAULT_VOLUME };
      const saver = { ...DEFAULT_SAVER };
      [ ['theme', theme], ['ui', ui], ['taskbar', taskbar], ['desktop', desktop], ['widgets', widgets], ['volume', volume], ['saver', saver] ]
        .forEach(([k, v]) => save(k, v));
      save('persona', 'win');
      return { ...state, persona: 'win', theme, ui, taskbar, desktop, widgets, volume, saver };
    }

    /* -- settings-object patches -- */
    case 'setUi': return patched(state, 'ui', action.patch);
    case 'setVolume': return patched(state, 'volume', action.patch);
    case 'setSaver': return patched(state, 'saver', action.patch);
    case 'setWidgets': return patched(state, 'widgets', action.patch);
    case 'setTaskbar': return patched(state, 'taskbar', action.patch);
    case 'setDesktop': return patched(state, 'desktop', action.patch);
    case 'setUiMode': {
      save('uiMode', action.mode);
      return { ...state, uiMode: action.mode };
    }
    case 'setMobile':
      return state.mobile === action.mobile ? state : { ...state, mobile: action.mobile };
    default:
      return state;
  }
}

/* ---------- context ---------- */
const OSCtx = createContext(null);

const coarse = () => window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
const autoMobile = () => coarse() || window.innerWidth < 700;

export function OSProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);

  // Desktop app list: defaults + installed store apps + user-created apps,
  // arranged by the saved order (unarranged ids keep registry order at the end).
  const apps = useMemo(() => {
    const list = [...allApps(state.installed), ...state.userApps];
    if (state.desktop.sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (!state.order.length) return list;
    const rank = new Map(state.order.map((id, i) => [id, i]));
    return [...list].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  }, [state.installed, state.userApps, state.order, state.desktop.sort]);

  const api = useMemo(() => ({
    apps,
    findApp: (id) => findApp(apps, id),
    launch: (appId, args) => dispatch({ type: 'launch', appId, args }),
    close: (id) => dispatch({ type: 'close', id }),
    focus: (id) => dispatch({ type: 'focus', id }),
    minimize: (id, unmin) => dispatch({ type: 'minimize', id, unmin }),
    toggleMax: (id) => dispatch({ type: 'toggleMax', id }),
    setRect: (id, rect) => dispatch({ type: 'setRect', id, rect }),
    snap: (id, zone) => dispatch({ type: 'snapWin', id, zone }),
    restore: (id) => dispatch({ type: 'restoreWin', id }),
    install: (appId) => dispatch({ type: 'install', appId }),
    uninstall: (appId) => dispatch({ type: 'uninstall', appId }),
    setTheme: (patch) => dispatch({ type: 'setTheme', patch }),
    setPersona: (id) => dispatch({ type: 'setPersona', id }),
    setUi: (patch) => dispatch({ type: 'setUi', patch }),
    addEvent: (date, text) => dispatch({ type: 'addEvent', date, text }),
    removeEvent: (date, index) => dispatch({ type: 'removeEvent', date, index }),
    setOrder: (order) => dispatch({ type: 'setOrder', order }),
    sortDesktop: () => dispatch({ type: 'sortDesktop' }),
    setVolume: (patch) => dispatch({ type: 'setVolume', patch }),
    setSaver: (patch) => dispatch({ type: 'setSaver', patch }),
    setWidgets: (patch) => dispatch({ type: 'setWidgets', patch }),
    setTaskbar: (patch) => dispatch({ type: 'setTaskbar', patch }),
    setDesktop: (patch) => dispatch({ type: 'setDesktop', patch }),
    resetLook: () => dispatch({ type: 'resetLook' }),
    setUiMode: (mode) => dispatch({ type: 'setUiMode', mode }),
    addUserApp: (app) => dispatch({ type: 'addUserApp', app }),
    updateUserApp: (app) => dispatch({ type: 'updateUserApp', app }),
    removeUserApp: (appId) => dispatch({ type: 'removeUserApp', appId }),
    addGroup: (group) => dispatch({ type: 'addGroup', group }),
    renameGroup: (id, name) => dispatch({ type: 'renameGroup', id, name }),
    removeGroup: (id) => dispatch({ type: 'removeGroup', id }),
    groupAdd: (id, appId) => dispatch({ type: 'groupAdd', id, appId }),
    groupRemove: (id, appId) => dispatch({ type: 'groupRemove', id, appId }),
    isDefault: (appId) => DEFAULT_APPS.some((a) => a.id === appId),
    isCustom: (appId) => state.userApps.some((a) => a.id === appId),
  }), [apps]);

  /* -- mobile detection (auto mode follows device; explicit mode wins) -- */
  useEffect(() => {
    const apply = () => dispatch({ type: 'setMobile', mobile: state.uiMode === 'mobile' || (state.uiMode === 'auto' && autoMobile()) });
    apply();
    window.addEventListener('resize', apply);
    window.matchMedia('(pointer: coarse)')?.addEventListener?.('change', apply);
    return () => {
      window.removeEventListener('resize', apply);
      window.matchMedia('(pointer: coarse)')?.removeEventListener?.('change', apply);
    };
  }, [state.uiMode]);

  /* -- theme + wallpaper to CSS -- */
  useEffect(() => {
    const p = THEME_PRESETS[state.theme.preset] || THEME_PRESETS.midnight;
    const root = document.documentElement.style;
    root.setProperty('--text', p.text);
    root.setProperty('--text-dim', p.dim);
    root.setProperty('--chrome', withAlpha(p.chrome, state.ui.transparency ?? 1));
    root.setProperty('--chrome-line', p.line);
    root.setProperty('--accent', state.theme.accent);
    // The preset bg stays on <body> as the base; an active wallpaper renders
    // in the #wallpaper layer (see App.jsx) so filters (blur/brightness/
    // saturation) can be applied to it — backgrounds can't take CSS filters.
    document.body.style.background = p.bg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.theme.preset === 'light' ? '#eef2f8' : '#0b0e14');
  }, [state.theme, state.ui.transparency]);

  /* -- granular interface: scale, animations, radius/blur overrides -- */
  useEffect(() => {
    document.documentElement.style.fontSize = `${Math.round(16 * (state.ui.scale || 1))}px`;
    document.body.toggleAttribute('data-anim-off', state.ui.anim === false);
    // Overrides beat persona defaults; '' = follow the persona.
    if (state.ui.radius) document.body.style.setProperty('--radius', state.ui.radius);
    else document.body.style.removeProperty('--radius');
    if (state.ui.blur !== '' && state.ui.blur != null) document.body.style.setProperty('--chrome-blur', `${state.ui.blur}px`);
    else document.body.style.removeProperty('--chrome-blur');
    // Chrome knobs (3.1): empty string = persona default, so the attribute
    // carries "" and no [data-*="value"] CSS rule can match it.
    document.body.dataset.tbside = state.ui.tbSide || '';
    document.body.dataset.titlealign = state.ui.titleAlign || '';
    document.body.dataset.font = state.ui.font || '';
    document.body.dataset.shadow = state.ui.shadow || '';
  }, [state.ui]);

  /* -- taskbar layout to body attrs (position / autohide) -- */
  useEffect(() => {
    document.body.dataset.persona = state.persona;
    document.body.dataset.tb = state.taskbar.position;
    document.body.toggleAttribute('data-tb-autohide', !!state.taskbar.autohide);
    document.body.dataset.tbAlign = state.taskbar.align || 'left';
    document.body.dataset.tbIco = state.taskbar.iconSize || 'md';
    document.body.toggleAttribute('data-icons', false);
    document.body.dataset.icons = state.desktop.iconSize;
    document.body.dataset.deskGap = state.desktop.gap || 'normal';
    document.body.dataset.mode = state.mobile ? 'mobile' : 'desktop';
  }, [state.persona, state.taskbar.position, state.taskbar.autohide, state.taskbar.align, state.taskbar.iconSize, state.desktop.iconSize, state.desktop.gap, state.mobile]);

  /* -- volume broadcast: apps opt in by listening for the event -- */
  useEffect(() => {
    document.dispatchEvent(new CustomEvent('webos:volume', { detail: state.volume }));
  }, [state.volume]);

  const value = useMemo(() => ({ ...state, ...api }), [state, api]);
  return <OSCtx.Provider value={value}>{children}</OSCtx.Provider>;
}

export function useOS() {
  return useContext(OSCtx);
}
