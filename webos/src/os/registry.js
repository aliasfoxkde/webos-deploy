// Application registry. Two sources feed it:
//  - EXTERNAL apps: pure data here (craft apps + hosted web apps). The OS
//    renders them in an iframe (EmbedFrame) or, when the site forbids framing,
//    a launch panel (embed: false).
//  - PLUGIN apps: bundled first-party apps under src/apps/<name>/, whose data
//    manifests are re-exported by apps/manifests.js and whose UI is wired by
//    apps/components.js. See docs/planning/webos-apps/ARCHITECTURE.md.
//
// `store: true` apps appear in the App Store and must be installed (persisted
// in localStorage) before they land on the desktop.

import { PLUGIN_APPS } from '../apps/manifests.js';

export const DEFAULT_APPS = [
  // -- the 8 craft apps (deployed on Cloudflare Pages from upstream release zips) --
  { id: 'cadcraft', name: 'CADCraft', tagline: 'CAD & drafting', version: '0.3.0', url: 'https://cadcraft-web.pages.dev/', icon: 'icons/cadcraft.svg', accent: '#22d3ee', embed: true },
  { id: 'designcraft', name: 'DesignCraft', tagline: 'Page layout', version: '0.4.0', url: 'https://designcraft-web.pages.dev/', icon: 'icons/designcraft.svg', accent: '#e879f9', embed: true },
  { id: 'gridcraft', name: 'GridCraft', tagline: 'Spreadsheets', version: '0.3.0', url: 'https://gridcraft-web.pages.dev/', icon: 'icons/gridcraft.svg', accent: '#34d399', embed: true },
  { id: 'lightcraft', name: 'LightCraft', tagline: 'Photo library', version: '0.4.0', url: 'https://lightcraft-web.pages.dev/', icon: 'icons/lightcraft.svg', accent: '#fbbf24', embed: true },
  { id: 'pdfcraft', name: 'PdfCraft', tagline: 'PDF documents', version: '0.4.0', url: 'https://pdfcraft-web.pages.dev/', icon: 'icons/pdfcraft.svg', accent: '#f87171', embed: true },
  { id: 'photocraft', name: 'PhotoCraft', tagline: 'Image editing', version: '0.5.0', url: 'https://photocraft-web.pages.dev/', icon: 'icons/photocraft.svg', accent: '#60a5fa', embed: true },
  { id: 'vectorcraft', name: 'VectorCraft', tagline: 'Vector illustration', version: '0.7.0', url: 'https://vectorcraft-web-9y7.pages.dev/', icon: 'icons/vectorcraft.svg', accent: '#a78bfa', embed: true },
  { id: 'wordcraft', name: 'WordCraft', tagline: 'Word processing', version: '0.3.0', url: 'https://wordcraft-web.pages.dev/', icon: 'icons/wordcraft.svg', accent: '#818cf8', embed: true },

  // -- extra default apps --
  { id: 'mail', name: 'Mail', tagline: 'Email client', version: '1.0', url: 'https://email-client.cyopsys.workers.dev/', icon: 'icons/mail.svg', accent: '#7dd3fc', embed: true },
  { id: 'music', name: 'SnaePlayer', tagline: 'Music player', version: '1.0', url: 'https://snaeplayer.com/library/tracks', icon: 'icons/music.svg', accent: '#fb923c', embed: false },
  { id: 'browser', name: 'Browser', tagline: 'Firefox in WebAssembly', version: '0.0.1', url: 'https://browserinbrowser.pages.dev/', icon: 'icons/browser.svg', accent: '#9580ff', embed: false },
  // Native editors (Lapce/Zed) cannot be compiled for the web today — the
  // bundled Editor plugin is the OS IDE. Fork release notes document this:
  // github.com/aliasfoxkde/lapce-ide/releases/tag/v0.4.6-webos

  // -- bundled plugin apps (src/apps/) --
  ...PLUGIN_APPS,
];

export const STORE_APPS = [
  { id: 'globe', name: 'Globe', tagline: 'Interactive 3D globe', version: '1.0', url: 'https://globe-52p.pages.dev/', icon: 'icons/globe.svg', accent: '#38bdf8', embed: false, category: 'Tools' },
  { id: 'storyweaver', name: 'StoryWeaver', tagline: 'Learning game', version: '1.0', url: 'https://storyweaver-8gh.pages.dev/', icon: 'icons/storyweaver.svg', accent: '#fbbf24', embed: true, category: 'Games' },
  { id: 'devopsquest', name: 'DevOps Quest', tagline: 'Ops adventure game', version: '1.0', url: 'https://devopsquest.pages.dev/', icon: 'icons/devopsquest.svg', accent: '#34d399', embed: true, category: 'Games' },
  { id: 'openzenith', name: 'OpenZenith', tagline: 'GIS & maps', version: '1.0', url: 'https://openzenith.pages.dev/', icon: 'icons/openzenith.svg', accent: '#2dd4bf', embed: false, category: 'Tools' },
  { id: 'sculptgl', name: 'SculptGL', tagline: '3D sculpting', version: '1.0', url: 'https://sculptgl-255.pages.dev/', icon: 'icons/sculptgl.svg', accent: '#f472b6', embed: false, category: 'Creative' },
  { id: 'svgedit', name: 'SVG.edit', tagline: 'SVG editor', version: '1.0', url: 'https://svgedit-8ia.pages.dev/', icon: 'icons/svgedit.svg', accent: '#a3e635', embed: true, category: 'Creative' },
  { id: 'ide', name: 'Qwen IDE', tagline: 'Code editor (WIP)', version: '0.5', url: 'https://qwen-terminal.pages.dev/', icon: 'icons/ide.svg', accent: '#60a5fa', embed: true, category: 'Development' },
  { id: 'opencad', name: 'OpenCAD Studio', tagline: 'CAD, in Rust', version: '1.0', url: 'https://opencadstudio-web.pages.dev/', icon: 'icons/opencad.svg', accent: '#22d3ee', embed: false, category: 'Creative' },
  { id: 'sqlite', name: 'SQLite Viewer', tagline: 'SQL editor & viewer', version: '1.0', url: 'https://sqliteviewer.app/', icon: 'icons/sqlite.svg', accent: '#818cf8', embed: true, category: 'Development' },
  { id: 'python', name: 'Online Python', tagline: 'Python IDE', version: '1.0', url: 'https://www.online-python.com/', icon: 'icons/python.svg', accent: '#eab308', embed: true, category: 'Development' },
  { id: 'pyconsole', name: 'Pyodide Console', tagline: 'Python terminal', version: '1.0', url: 'https://pyodide.org/en/latest/console.html', icon: 'icons/pyconsole.svg', accent: '#f97316', embed: true, category: 'Development' },
  { id: 'planly', name: 'Planly', tagline: 'Planner & tasks', version: '1.0', url: 'https://planly.site/', icon: 'icons/planly.svg', accent: '#4ade80', embed: true, category: 'Tools' },
];

export function allApps(installed) {
  const storeInstalled = STORE_APPS.filter((a) => installed.includes(a.id));
  return [...DEFAULT_APPS, ...storeInstalled];
}

export function findApp(apps, id) {
  return apps.find((a) => a.id === id);
}

// Flat lookup used by the window manager for launch sizing.
export const APP_INDEX = [...DEFAULT_APPS, ...STORE_APPS];

// Plugin apps render inside the OS window regardless of `embed` (which only
// governs external iframe targets); they never open in a new tab.
export const PLUGIN_IDS = new Set(PLUGIN_APPS.map((a) => a.id));
