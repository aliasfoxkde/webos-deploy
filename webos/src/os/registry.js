// Application registry. Two sources feed it:
//  - EXTERNAL apps: pure data here (craft apps + hosted web apps). The OS
//    renders them in an iframe (EmbedFrame) or, when the site forbids framing,
//    a launch panel (embed: false).
//  - PLUGIN apps: bundled first-party apps under src/apps/<name>/, whose data
//    manifests are re-exported by apps/manifests.js and whose UI is wired by
//    apps/components.js. See docs/planning/webos-apps/ARCHITECTURE.md.
//
// Every app row carries the full property sheet shown in the App Store and in
// the desktop "Properties" dialog: name, tagline, description, developer,
// category, rating (0-5) + review count, version, source. `store: true` apps
// (STORE_APPS) must be installed from the App Store before they land on the
// desktop; DEFAULT_APPS ship with the OS.

import { PLUGIN_APPS } from '../apps/manifests.js';

export const DEFAULT_APPS = [
  // -- the 8 craft apps (deployed on Cloudflare Pages from upstream release zips) --
  {
    id: 'cadcraft', name: 'CADCraft', tagline: 'CAD & drafting', version: '0.3.0',
    url: 'https://cadcraft-web.pages.dev/', icon: 'icons/craft/cadcraft.png', accent: '#22d3ee', embed: true,
    developer: 'ArtCraft', category: 'Design', rating: 4.7, reviews: 128,
    description: 'Precision 2D CAD and drafting in the browser: layers, snaps, dimensions, DXF workflows — a clean-room reimagining of classic desktop CAD as pure Rust/WebAssembly.',
  },
  {
    id: 'designcraft', name: 'DesignCraft', tagline: 'Page layout', version: '0.4.0',
    url: 'https://designcraft-web.pages.dev/', icon: 'icons/craft/designcraft.png', accent: '#e879f9', embed: true,
    developer: 'ArtCraft', category: 'Design', rating: 4.5, reviews: 96,
    description: 'Multi-page layout for print and digital: master pages, text flow, frames, and precise typography controls — desktop-publishing chops without the desktop.',
  },
  {
    id: 'gridcraft', name: 'GridCraft', tagline: 'Spreadsheets', version: '0.3.0',
    url: 'https://gridcraft-web.pages.dev/', icon: 'icons/craft/gridcraft.png', accent: '#34d399', embed: true,
    developer: 'ArtCraft', category: 'Productivity', rating: 4.6, reviews: 143,
    description: 'A fast spreadsheet engine with formulas, ranges, formatting, and charts. Everything runs locally in WebAssembly — your sheets never leave the browser.',
  },
  {
    id: 'lightcraft', name: 'LightCraft', tagline: 'Photo library', version: '0.4.0',
    url: 'https://lightcraft-web.pages.dev/', icon: 'icons/craft/lightcraft.png', accent: '#fbbf24', embed: true,
    developer: 'ArtCraft', category: 'Photo', rating: 4.4, reviews: 87,
    description: 'Catalog, cull, and grade your photo library: ratings, flags, collections, and non-destructive adjustments with a raw-focused develop pipeline.',
  },
  {
    id: 'pdfcraft', name: 'PdfCraft', tagline: 'PDF documents', version: '0.4.0',
    url: 'https://pdfcraft-web.pages.dev/', icon: 'icons/craft/pdfcraft.png', accent: '#f87171', embed: true,
    developer: 'ArtCraft', category: 'Productivity', rating: 4.5, reviews: 112,
    description: 'Read, annotate, assemble, and export PDF documents. Page manipulation, comments, and form-friendly rendering — all client-side, no uploads.',
  },
  {
    id: 'photocraft', name: 'PhotoCraft', tagline: 'Image editing', version: '0.5.0',
    url: 'https://photocraft-web.pages.dev/', icon: 'icons/craft/photocraft.png', accent: '#60a5fa', embed: true,
    developer: 'ArtCraft', category: 'Photo', rating: 4.8, reviews: 201,
    description: 'Layer-based raster image editing: selections, masks, brushes, filters, and adjustment layers with non-destructive editing — the flagship ArtCraft editor.',
  },
  {
    id: 'vectorcraft', name: 'VectorCraft', tagline: 'Vector illustration', version: '0.7.0',
    url: 'https://vectorcraft-web-9y7.pages.dev/', icon: 'icons/craft/vectorcraft.png', accent: '#a78bfa', embed: true,
    developer: 'ArtCraft', category: 'Design', rating: 4.7, reviews: 165,
    description: 'Bezier drawing, paths, booleans, gradients, and artboards for illustration and logo work. Exports clean SVG — infinitely scalable by nature.',
  },
  {
    id: 'wordcraft', name: 'WordCraft', tagline: 'Word processing', version: '0.3.0',
    url: 'https://wordcraft-web.pages.dev/', icon: 'icons/craft/wordcraft.png', accent: '#818cf8', embed: true,
    developer: 'ArtCraft', category: 'Productivity', rating: 4.3, reviews: 74,
    description: 'A focused word processor: styles, tables, headers, and clean document flow with export. Distraction-free writing with real layout under the hood.',
  },
  {
    id: 'deckcraft', name: 'DeckCraft', tagline: 'Presentations', version: '0.4.0',
    url: 'https://deckcraft-web.pages.dev/', icon: 'icons/craft/deckcraft.png', accent: '#fb923c', embed: true,
    developer: 'ArtCraft', category: 'Productivity', rating: 4.4, reviews: 58,
    description: 'Slide decks with real layout: masters, placeholders, themes, shape geometry, and presenter flow — a clean-room reimagining of the classic presentation suite in Rust/WebAssembly.',
  },

  // -- extra default apps --
  {
    id: 'mail', name: 'Mail', tagline: 'Email client', version: '1.0', singleInstance: true,
    url: 'https://email-client.cyopsys.workers.dev/', icon: 'icons/mail.svg', accent: '#7dd3fc', embed: true,
    developer: 'CyOpsys', category: 'Productivity', rating: 4.1, reviews: 52,
    description: 'A lightweight webmail client hosted as a Worker. Connect an account and read, compose, and search mail without leaving the desktop.',
  },
  {
    id: 'music', name: 'SnaePlayer', tagline: 'Music player', version: '1.0',
    url: 'https://snaeplayer.com/library/tracks', icon: 'icons/music.svg', accent: '#fb923c', embed: false,
    developer: 'SnaePlayer', category: 'Media', rating: 4.0, reviews: 38,
    description: 'Streaming music library and player. This one opens in its own tab — the site forbids embedding, so the OS gives it an honest launch panel.',
  },
  {
    id: 'browser', name: 'Browser', tagline: 'Firefox in WebAssembly', version: '0.0.1',
    url: 'https://browserinbrowser.pages.dev/', icon: 'icons/browser.svg', accent: '#9580ff', embed: false,
    developer: 'WebOS Labs', category: 'Tools', rating: 3.9, reviews: 61,
    description: 'A full Firefox build compiled to WebAssembly, running inside a page. Experimental and heavy — launches in a tab with a memory heads-up.',
  },
  // Native editors (Lapce/Zed) cannot be compiled for the web today — the
  // bundled Editor plugin is the OS IDE. Fork release notes document this:
  // github.com/aliasfoxkde/lapce-ide/releases/tag/v0.4.6-webos

  // -- web essentials, on the desktop out of the box --
  // All four services send X-Frame-Options/CSP frame-ancestors, so they ship
  // embed: false — the OS gives each an honest launch panel / new-tab open.
  {
    id: 'youtube', name: 'YouTube', tagline: 'Video streaming', version: '1.0',
    url: 'https://www.youtube.com/', icon: 'icons/youtube.svg', accent: '#f87171', embed: false,
    developer: 'Google', category: 'Media', rating: 4.5, reviews: 812,
    description: 'Watch, search, and subscribe. Opens in its own tab — YouTube forbids embedding inside other sites.',
  },
  {
    id: 'discord', name: 'Discord', tagline: 'Chat & communities', version: '1.0', singleInstance: true,
    url: 'https://discord.com/app', icon: 'icons/discord.svg', accent: '#818cf8', embed: false,
    developer: 'Discord Inc.', category: 'Social', rating: 4.6, reviews: 640,
    description: 'Voice, video, and text for your communities. Opens in its own tab — Discord forbids embedding.',
  },
  {
    id: 'spotify', name: 'Spotify', tagline: 'Music & podcasts', version: '1.0', singleInstance: true,
    url: 'https://open.spotify.com/', icon: 'icons/spotify.svg', accent: '#34d399', embed: false,
    developer: 'Spotify AB', category: 'Media', rating: 4.7, reviews: 903,
    description: 'Millions of songs and podcasts. Opens in its own tab — the Spotify player forbids embedding.',
  },
  {
    id: 'chatgpt', name: 'ChatGPT', tagline: 'AI assistant', version: '1.0', singleInstance: true,
    url: 'https://chatgpt.com/', icon: 'icons/chatgpt.svg', accent: '#10a37f', embed: false,
    developer: 'OpenAI', category: 'Tools', rating: 4.8, reviews: 1204,
    description: 'Conversational AI assistant for writing, coding, and research. Opens in its own tab — ChatGPT forbids embedding.',
  },

  // -- bundled plugin apps (src/apps/) --
  ...PLUGIN_APPS,
];

export const STORE_APPS = [
  {
    id: 'globe', name: 'Globe', tagline: 'Interactive 3D globe', version: '1.0',
    url: 'https://globe-52p.pages.dev/', icon: 'icons/globe.svg', accent: '#38bdf8', embed: false,
    developer: 'WebOS Labs', category: 'Tools', rating: 4.2, reviews: 44,
    description: 'A rotatable, zoomable 3D Earth with day/night terminator and city markers. WebGL-powered and surprisingly light.',
  },
  {
    id: 'storyweaver', name: 'StoryWeaver', tagline: 'Learning game', version: '1.0',
    url: 'https://storyweaver-8gh.pages.dev/', icon: 'icons/storyweaver.svg', accent: '#fbbf24', embed: true,
    developer: 'WebOS Labs', category: 'Games', rating: 4.6, reviews: 89,
    description: 'Branching-story language game: make choices, grow vocabulary, and see your tale unfold. Runs entirely in the browser.',
  },
  {
    id: 'devopsquest', name: 'DevOps Quest', tagline: 'Ops adventure game', version: '1.0',
    url: 'https://devopsquest.pages.dev/', icon: 'icons/devopsquest.svg', accent: '#34d399', embed: true,
    developer: 'WebOS Labs', category: 'Games', rating: 4.4, reviews: 57,
    description: 'Learn CI/CD, containers, and incident response by playing through escalating outages. A dungeon crawl for operators.',
  },
  {
    id: 'openzenith', name: 'OpenZenith', tagline: 'GIS & maps', version: '1.0',
    url: 'https://openzenith.pages.dev/', icon: 'icons/openzenith.svg', accent: '#2dd4bf', embed: false,
    developer: 'OpenZenith', category: 'Tools', rating: 4.1, reviews: 33,
    description: 'Geospatial viewer: layered maps, coordinates, and dataset overlays. Opens in its own tab for full-screen map work.',
  },
  {
    id: 'sculptgl', name: 'SculptGL', tagline: '3D sculpting', version: '1.0',
    url: 'https://sculptgl-255.pages.dev/', icon: 'icons/sculptgl.svg', accent: '#f472b6', embed: false,
    developer: 'Stephane Ginier (mirror)', category: 'Creative', rating: 4.3, reviews: 71,
    description: 'Sculpt organic meshes with brushes, symmetry, and multiresolution detail, then export OBJ. The classic WebGL sculpting app.',
  },
  {
    id: 'svgedit', name: 'SVG.edit', tagline: 'SVG editor', version: '1.0',
    url: 'https://svgedit-8ia.pages.dev/', icon: 'icons/svgedit.svg', accent: '#a3e635', embed: true,
    developer: 'SVG-edit contributors', category: 'Creative', rating: 4.0, reviews: 66,
    description: 'The venerable open-source SVG editor: shapes, paths, text, and layers with direct XML export.',
  },
  {
    id: 'ide', name: 'Qwen IDE', tagline: 'Code editor (WIP)', version: '0.5',
    url: 'https://qwen-terminal.pages.dev/', icon: 'icons/ide.svg', accent: '#60a5fa', embed: true,
    developer: 'WebOS Labs', category: 'Development', rating: 3.7, reviews: 29,
    description: 'An experimental cloud-flavored IDE with an integrated assistant terminal. Work in progress — expect rough edges.',
  },
  {
    id: 'opencad', name: 'OpenCAD Studio', tagline: 'CAD, in Rust', version: '1.0',
    url: 'https://opencadstudio-web.pages.dev/', icon: 'icons/opencad.svg', accent: '#22d3ee', embed: false,
    developer: 'OpenCAD Studio', category: 'Creative', rating: 4.5, reviews: 58,
    description: 'Parametric 3D CAD compiled from Rust to WebAssembly. Sketch, extrude, and export — opens in a tab for GPU headroom.',
  },
  {
    id: 'sqlite', name: 'SQLite Viewer', tagline: 'SQL editor & viewer', version: '1.0',
    url: 'https://sqliteviewer.app/', icon: 'icons/sqlite.svg', accent: '#818cf8', embed: true,
    developer: 'sqliteviewer.app', category: 'Development', rating: 4.6, reviews: 97,
    description: 'Drop in a .sqlite/.db file and browse schema, run queries, and inspect rows — the file never leaves your machine.',
  },
  {
    id: 'python', name: 'Online Python', tagline: 'Python IDE', version: '1.0',
    url: 'https://www.online-python.com/', icon: 'icons/python.svg', accent: '#eab308', embed: true,
    developer: 'online-python.com', category: 'Development', rating: 4.2, reviews: 84,
    description: 'Write and run Python 3 in the browser with a standard library and immediate output. Handy for quick scripts.',
  },
  {
    id: 'pyconsole', name: 'Pyodide Console', tagline: 'Python terminal', version: '1.0',
    url: 'https://pyodide.org/en/latest/console.html', icon: 'icons/pyconsole.svg', accent: '#f97316', embed: true,
    developer: 'Pyodide project', category: 'Development', rating: 4.7, reviews: 118,
    description: 'The official Pyodide REPL — CPython compiled to WebAssembly with numpy, pandas, and friends installable on the fly.',
  },
  {
    id: 'planly', name: 'Planly', tagline: 'Planner & tasks', version: '1.0',
    url: 'https://planly.site/', icon: 'icons/planly.svg', accent: '#4ade80', embed: true,
    developer: 'Planly', category: 'Productivity', rating: 4.4, reviews: 47,
    description: 'Task boards, schedules, and habit tracking in a clean interface. Your plans persist in the browser.',
  },

  // -- third wave (3.0.0): open web apps + games, frame-embeddability probed
  //    via X-Frame-Options / CSP frame-ancestors before each was added. Icons
  //    are WebOS-drawn glyphs in the house style, NOT vendor marks; names and
  //    links are referential. Underlying projects: 2048 MIT, Hextris MIT,
  //    Excalidraw MIT, tldraw Apache-2.0, Squoosh Apache-2.0.
  {
    id: 'g2048', name: '2048', tagline: 'Tile-sliding puzzle', version: '1.0',
    url: 'https://gabrielecirulli.github.io/2048/', icon: 'icons/g2048.svg', accent: '#fbbf24', embed: true,
    developer: 'Gabriele Cirulli (MIT)', category: 'Games', rating: 4.7, reviews: 312,
    description: 'The original open-source 2048: swipe tiles, merge equal numbers, chase the 2048 tile. Endlessly replayable and famously hard to put down.',
  },
  {
    id: 'hextris', name: 'Hextris', tagline: 'Hexagonal arcade', version: '1.0',
    url: 'https://hextris.github.io/', icon: 'icons/hextris.svg', accent: '#a78bfa', embed: true,
    developer: 'Hextris team (MIT)', category: 'Games', rating: 4.5, reviews: 178,
    description: 'A fast-paced puzzle game inspired by hexagonal rotational play — match colors on a spinning hexagon before it fills. Open source and addictive.',
  },
  {
    id: 'untrusted', name: 'Untrusted', tagline: 'JS adventure', version: '1.0',
    url: 'https://untrustedgame.com/', icon: 'icons/untrusted.svg', accent: '#34d399', embed: true,
    developer: 'Alex Nisnevich & Greg Shuflin', category: 'Games', rating: 4.6, reviews: 94,
    description: 'A roguelike you beat by rewriting its JavaScript: edit the machine code of each level to escape the maze. Learn coding by breaking out.',
  },
  {
    id: 'hexgl', name: 'HexGL', tagline: 'Anti-grav racing', version: '1.0',
    url: 'https://hexgl.bkcore.com/', icon: 'icons/hexgl.svg', accent: '#f87171', embed: true,
    developer: 'Thibaut Despoulain', category: 'Games', rating: 4.3, reviews: 126,
    description: 'A futuristic anti-gravity racer built on WebGL — blistering speed, a neon city track, and real-time reflections. Keyboard controls, browser-native.',
  },
  {
    id: 'excalidraw', name: 'Excalidraw', tagline: 'Virtual whiteboard', version: '1.0',
    url: 'https://excalidraw.com/', icon: 'icons/excalidraw.svg', accent: '#a3e635', embed: true,
    developer: 'Excalidraw (MIT)', category: 'Creative', rating: 4.8, reviews: 267,
    description: 'Hand-drawn-style diagramming and whiteboarding: sketch flows, wireframes, and diagrams with a charming sketchy look. Export PNG/SVG, share links.',
  },
  {
    id: 'tldraw', name: 'tldraw', tagline: 'Infinite canvas', version: '1.0',
    url: 'https://www.tldraw.com/', icon: 'icons/tldraw.svg', accent: '#60a5fa', embed: true,
    developer: 'tldraw (Apache-2.0)', category: 'Creative', rating: 4.7, reviews: 155,
    description: 'An infinite collaborative canvas with buttery shapes, arrows, and freehand drawing. The smoothest drawing feel in a browser tab.',
  },
  {
    id: 'squoosh', name: 'Squoosh', tagline: 'Image compression', version: '1.0',
    url: 'https://squoosh.app/', icon: 'icons/squoosh.svg', accent: '#fb923c', embed: true,
    developer: 'GoogleChromeLabs (Apache-2.0)', category: 'Tools', rating: 4.8, reviews: 203,
    description: 'Compress and convert images right in the browser with side-by-side quality comparison — MozJPEG, WebP, AVIF and more, all client-side.',
  },
  {
    id: 'photopea', name: 'Photopea', tagline: 'Photoshop-grade editor', version: '1.0',
    url: 'https://www.photopea.com/', icon: 'icons/photopea.svg', accent: '#38bdf8', embed: true,
    developer: 'Ivan Kutskir', category: 'Photo', rating: 4.7, reviews: 421,
    description: 'A full photo editor that opens PSD, XCF, Sketch and RAW files in the browser — layers, masks, filters, and PSD-compatible export. Free with ads.',
  },
  {
    id: 'bridge-demo', name: 'Bridge Demo', tagline: 'File-storage fixture', version: '1.0',
    url: 'bridge-demo.html', icon: 'icons/custom.svg', accent: '#38bdf8', embed: true,
    developer: 'ArtCraft', category: 'Tools', rating: null, reviews: 0,
    description: 'Developer fixture for the WebOS file-storage bridge: a same-origin page that lists, saves, opens and deletes files under /Apps/bridge-demo/ via the webos:file-* postMessage protocol. Useful as a working reference for embedding your own app.',
  },
];

// All desktop categories across both catalogs (for store filtering).
export const CATEGORIES = [...new Set([...DEFAULT_APPS, ...STORE_APPS].map((a) => a.category))].sort();

export function allApps(installed) {
  const storeInstalled = STORE_APPS.filter((a) => installed.includes(a.id));
  return [...DEFAULT_APPS, ...storeInstalled];
}

export function findApp(apps, id) {
  return apps.find((a) => a.id === id);
}

// Flat lookup used by the window manager for launch sizing + properties.
export const APP_INDEX = [...DEFAULT_APPS, ...STORE_APPS];

// Plugin apps render inside the OS window regardless of `embed` (which only
// governs external iframe targets); they never open in a new tab.
export const PLUGIN_IDS = new Set(PLUGIN_APPS.map((a) => a.id));
