import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { allApps, findApp, DEFAULT_APPS, APP_INDEX } from './registry.js';

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

const DEFAULT_THEME = { preset: 'midnight', accent: '#38bdf8', wallpaper: '', dim: 1 };

/* ---------- reducer ---------- */
const initial = () => ({
  installed: load('installed', ['storyweaver', 'svgedit', 'python', 'pyconsole', 'sqlite', 'ide', 'globe', 'devopsquest', 'openzenith', 'sculptgl', 'opencad', 'planly']),
  theme: { ...DEFAULT_THEME, ...load('theme', {}) },
  events: load('events', {}),
  windows: [],
  zTop: 10,
  focused: null,
  seq: 1,
});

function reducer(state, action) {
  switch (action.type) {
    case 'launch': {
      const existing = state.windows.find((w) => w.appId === action.appId);
      if (existing) {
        return reducer({ ...state }, { type: 'focus', id: existing.id, unminimize: true });
      }
      const id = state.seq;
      const n = state.windows.length;
      const off = (n % 6) * 28;
      const mobile = window.innerWidth < 700;
      const def = APP_INDEX.find((a) => a.id === action.appId);
      const w = mobile ? window.innerWidth : Math.min(def?.win?.w || 1120, window.innerWidth - 80 - off);
      const h = mobile ? window.innerHeight - 52 : Math.min(def?.win?.h || 700, window.innerHeight - 130 - off);
      const rect = mobile
        ? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight - 52 }
        : { x: Math.max(12, off + 60), y: Math.max(12, off + 30), w, h };
      return {
        ...state,
        seq: id + 1,
        windows: [...state.windows, { id, appId: action.appId, rect, z: state.zTop + 1, min: false, max: mobile }],
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
      return { ...state, windows: state.windows.map((w) => (w.id === action.id ? { ...w, max: !w.max } : w)) };
    case 'setRect':
      return { ...state, windows: state.windows.map((w) => (w.id === action.id ? { ...w, rect: action.rect } : w)) };
    case 'install': {
      const installed = state.installed.includes(action.appId) ? state.installed : [...state.installed, action.appId];
      save('installed', installed);
      return { ...state, installed };
    }
    case 'uninstall': {
      const installed = state.installed.filter((id) => id !== action.appId);
      save('installed', installed);
      return { ...state, installed, windows: state.windows.filter((w) => w.appId !== action.appId) };
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
    default:
      return state;
  }
}

/* ---------- context ---------- */
const OSCtx = createContext(null);

export function OSProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);

  const apps = useMemo(() => allApps(state.installed), [state.installed]);
  const api = useMemo(() => ({
    apps,
    findApp: (id) => findApp(apps, id),
    launch: (appId) => dispatch({ type: 'launch', appId }),
    close: (id) => dispatch({ type: 'close', id }),
    focus: (id) => dispatch({ type: 'focus', id }),
    minimize: (id, unmin) => dispatch({ type: 'minimize', id, unmin }),
    toggleMax: (id) => dispatch({ type: 'toggleMax', id }),
    setRect: (id, rect) => dispatch({ type: 'setRect', id, rect }),
    install: (appId) => dispatch({ type: 'install', appId }),
    uninstall: (appId) => dispatch({ type: 'uninstall', appId }),
    setTheme: (patch) => dispatch({ type: 'setTheme', patch }),
    addEvent: (date, text) => dispatch({ type: 'addEvent', date, text }),
    removeEvent: (date, index) => dispatch({ type: 'removeEvent', date, index }),
    isDefault: (appId) => DEFAULT_APPS.some((a) => a.id === appId),
  }), [apps]);

  // Apply theme to CSS custom properties.
  useEffect(() => {
    const p = THEME_PRESETS[state.theme.preset] || THEME_PRESETS.midnight;
    const root = document.documentElement.style;
    root.setProperty('--text', p.text);
    root.setProperty('--text-dim', p.dim);
    root.setProperty('--chrome', p.chrome);
    root.setProperty('--chrome-line', p.line);
    root.setProperty('--accent', state.theme.accent);
    document.body.style.background = state.theme.wallpaper
      ? `linear-gradient(rgba(0,0,0,${0.35 * (1 - state.theme.dim)}) , rgba(0,0,0,${0.35 * (1 - state.theme.dim)})), url("${state.theme.wallpaper}") center/cover no-fixed`
      : p.bg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.theme.preset === 'light' ? '#eef2f8' : '#0b0e14');
  }, [state.theme]);

  const value = useMemo(() => ({ ...state, ...api }), [state, api]);
  return <OSCtx.Provider value={value}>{children}</OSCtx.Provider>;
}

export function useOS() {
  return useContext(OSCtx);
}
