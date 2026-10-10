# WebOS App Architecture — Plugin System

Status: implemented 2026-10-09 · owner: webos-deploy

## Goal

Every "app" in the WebOS is a **plugin**: a self-contained directory with a
data manifest, its own UI, and (optionally) its own scoped CSS. The shell
(window manager, taskbar, start menu, store, settings) knows nothing about
individual apps — it renders whatever the registry hands it. This keeps files
small, keeps apps separable, and makes adding the next app a copy-paste
pattern instead of a shell surgery.

## Layout

```
webos/src/
├── main.jsx                  entry (Vite)
├── App.jsx                   desktop root: windows, icon drag-reorder, context menus,
│                             properties dialog, widget sidebar, mobile drawer, deep links
├── styles.css                shell chrome only (desktop, windows, taskbar, popups)
├── os/                       OS core — no UI
│   ├── registry.js           app data: external defaults, store apps, plugin manifests;
│   │                         every row carries description/developer/category/rating
│   ├── state.jsx             reducer + persistence (webos.* keys), theme engine,
│   │                         taskbar/desktop/widgets/volume/uiMode state, mobile detect
│   └── wallpapers.js         CSS-only wallpaper pack + upload/URL dimming math
├── shell/                    window-system UI
│   ├── Window.jsx            window chrome; 8-direction resize; plugin vs EmbedFrame
│   ├── EmbedFrame.jsx        iframe hosting + honest "open in new tab" panel
│   ├── Taskbar.jsx           tray (volume/network popups via body portal), clock config;
│   │                         position/autohide via body[data-tb]
│   ├── StartMenu.jsx AppStore.jsx (ratings + detail view) Settings.jsx (control center)
│   ├── settings/             Appearance.jsx + Panels.jsx (desktop/taskbar/widgets/
│   │                         sound/network/apps/storage/about sections)
│   ├── Properties.jsx        app property sheet (any icon/taskbar/titlebar right-click)
│   ├── Sidebar.jsx           widget sidebar (weather/clock/battery/events/notes/storage,
│   │                         enable + reorder persisted)
│   ├── MobileDrawer.jsx      Android-style full-screen app grid for mobile mode
│   ├── ContextMenu.jsx       global right-click system (data-cm="kind:arg")
│   └── Calendar.jsx          clock popup with per-day events
└── apps/                     first-party plugins — one directory per app
    ├── manifests.js          data-only barrel (imported by os/registry.js)
    ├── components.js         component barrel (imported by shell/Window.jsx)
    ├── terminal/  { manifest.js, Terminal.jsx }
    ├── video/     { manifest.js, VideoApp.jsx }
    ├── editor/    CodeMirror 6 code editor
    │   ├── manifest.js
    │   ├── Editor.jsx      toolbar, buffer tabs, status bar, file IO
    │   ├── buffers.js      pure buffer reducer + localStorage persistence
    │   ├── language.js     ext→language map, theme + highlight style
    │   └── editor.css      scoped styles
    ├── weather/   Open-Meteo client (keyless)
    │   ├── manifest.js api.js (geocode + forecast + WMO map) WeatherApp.jsx
    │   └── WxIcon.jsx      SVG glyphs — own module so the sidebar doesn't pull
    │                        the app chunk into the shell bundle
    └── calculator/
        ├── manifest.js
        ├── Calculator.jsx    mode tabs + provider
        ├── calcState.jsx     shared state: entry, history, memory, angle, precision
        ├── Display.jsx Keypad.jsx BasicKeys.jsx
        ├── calculator.css    scoped styles
        ├── engine/           pure expression engine (no React)
        │   ├── errors.js lexer.js parser.js functions.js evaluate.js format.js
        │   ├── programmer.js BigInt bitwise evaluator
        │   └── index.js      public barrel + compile()
        ├── modes/            Standard, Scientific, Graphing, Programmer, Converter, History
        └── graph/PlotCanvas.jsx
```

### State surface (all `webos.*` localStorage, JSON)

`installed` (store app ids; defaults ship, store apps do NOT preinstall — a
one-time migration drops the old preinstalled list) · `userapps` (custom apps
created via right-click → Add app…: name, link, icon URL/dataURL, description,
accent, embed preference) · `theme` (preset, accent, wallpaper CSS/URL/dataURL,
dim, image fit/pos/blur/brightness/saturation — images render in the
`#wallpaper` fixed layer so filters can apply) · `desktop.order` + `desktop`
(iconSize, sort) · `taskbar` (position bottom|top, autohide, labels, clock24,
showDate, pinned app ids — drag icons onto the bar to pin, drag within the bar
to reorder) · `widgets`
(enabled ids in display order) · `volume` (level, muted; broadcast to apps as a
`webos:volume` CustomEvent) · `uiMode` (auto|desktop|mobile) · `events` ·
`notes` · `weather.loc` + `weather.units` (metric|imperial; app and sidebar
widget flip together via the `webos:units` event) · plus per-app keys
(`webos.calc.*`, `webos.editor.state`).

### Window tiling (snapping)

`os/snap.js` defines the zone geometry: drag a titlebar within 12px of a
screen edge to tile (left/right halves), into a corner for quarters, or to
the top edge to maximize. While dragging, `#snap-preview` (body portal)
outlines the target. Tiled windows carry `snap` (zone) + `pre` (floating
rect): dragging a tiled window tears it off at its pre-snap size, and
Win-style keys (Meta+Arrow / Ctrl+Alt+Arrow on the focused window) snap left
half, right half, maximize (Up), and untile/unmaximize or minimize (Down).
Both `Window.jsx` and the `VirtualWindow` share one move-drag implementation
(`shell/winDrag.js`) — including tear-off of maximized windows.

### Tray popups and the backdrop-filter containing block

The taskbar footer uses `backdrop-filter`, which makes it the *containing
block* for `position: fixed` descendants — a popup rendered inside `<footer>`
with `inset: 0` only covers the 52px bar (this was the calendar-won't-close
regression). All tray popups now render through `createPortal(…, document.body)`
(`#tb-portal`), and close via a document-level capture `pointerdown` listener.

## Plugin contract

A plugin is a directory under `src/apps/<name>/` with:

1. **`manifest.js`** — pure data, no React imports:

```js
export default {
  id: 'calc',                  // unique, used in deep links (?open=calc)
  name: 'Calculator',
  tagline: 'Standard · Scientific · Graphing · Programmer',
  version: '2.0',
  icon: 'icons/calc.svg',      // under webos/public/icons/
  accent: '#c084fc',
  win: { w: 430, h: 640 },     // preferred window size (optional)
};
```

2. **A React component** (default export) rendered inside the window body.

3. **Registration, two lines:**
   - `apps/manifests.js`: add the manifest to `PLUGIN_APPS` (registry data).
   - `apps/components.js`: map `id → component` in `APP_COMPONENTS`.

The two-barrel split is deliberate: `os/registry.js` imports *data* only
(`manifests.js`), so the OS core never pulls the component graph; the window
layer resolves components separately (`components.js`). No import cycles.

`components.js` registers every plugin with `React.lazy` — Vite emits one
chunk per plugin and `Window.jsx` wraps plugin renders in `<Suspense>`, so a
plugin's heavy deps (CodeMirror in the Editor) load on first launch instead of
shipping in the shell bundle.

### External (hosted) apps

Apps that live on other domains are pure data rows in `os/registry.js`
(`DEFAULT_APPS` / `STORE_APPS`). `embed: true` hosts them in an iframe;
`embed: false` (site sends X-Frame-Options/CSP frame-ancestors, or requires
cross-origin isolation) gets a launch panel that opens a new tab.
Store apps additionally carry `category` and appear in the App Store;
installation state persists in `localStorage['webos.installed']`.

### Window sizing

`os/state.jsx` launch reducer clamps the manifest's `win.w/h` to the viewport;
apps without a manifest fall back to the 1120×700 default.

## Calculator engine notes

- **No `eval()`** — a real pipeline: `lexer → parser (precedence climbing) →
  AST evaluator`. Pretty glyphs (× ÷ − π) normalize in the lexer.
- Precedence: `+ -` < `* / mod` < implicit multiplication & unary minus < `^`
  (right-assoc) < postfix `! %`. Implicit multiplication binds tighter than
  explicit `*`, so `1/2π = 1/(2π)` and `2x^2 = 2*(x^2)`.
- `relaxed: true` evaluation returns `NaN` instead of throwing — the plotter
  samples thousands of points and discontinuities are data, not failures.
- Graphing compiles expressions once (`compile()`), evaluates per pixel.
- Programmer mode is a separate BigInt evaluator (fixed word size 8/16/32/64,
  two's complement, `| ^ & << >>` precedence ladder); digit parsing is
  per-digit to avoid `parseInt` precision loss past 32 bits.
- Persists under `webos.calc.*` (mode, angle, precision, history ≤ 60, memory).

## Editor plugin notes

- CodeMirror 6 (`codemirror` meta + `@codemirror/lang-*` for js/ts, html, css,
  json, markdown, python, rust). Language picked by file extension.
- Buffers are a pure reducer (`buffers.js`): new / edit / rename / close /
  saved. Text persists to `localStorage['webos.editor.state']` (debounced,
  1.5M-char cap); the File System Access `handle` is session-only — a restored
  buffer shows "link lost" until re-opened.
- Open/Save use `showOpenFilePicker`/`showSaveFilePicker` where available
  (Chromium); elsewhere `<input type=file>` open and `<a download>` export.
- Ctrl/Cmd+S saves; unsaved buffers confirm before close.
- **Why not Lapce or Zed:** neither compiles for the web today. Lapce's floem
  UI toolkit and winit windowing are native-only (no wasm32 target anywhere in
  the tree); Zed has only an early `crates/gpui_web` experiment and the editor
  crate itself has no web gating — `cargo check --target wasm32` fails at the
  dep level. The bundled Editor is the WebOS IDE; the lapce fork carries a
  notes-only release documenting this
  (github.com/aliasfoxkde/lapce-ide/releases/tag/v0.4.6-webos).

## DevOps

- Build: `npm run build` in `webos/` → `dist/` (static, base `./`).
- Deploy: `npx wrangler pages deploy dist --project-name artcraft-webos --branch main`
  (see `packaging/HOSTING.md` and the root `README.md` for the full procedure and live URLs).
- Preview locally: `npm run preview` (port 5180).
- Icons: hand-written SVGs in `webos/public/icons/`, rasterized via
  `packaging/icons-render.sh` (headless Chromium; ImageMagick cannot stroke SVG).
- App Store additions: append a row to `STORE_APPS` in `os/registry.js`
  (verify embeddability first: `curl -sI <url> | grep -i 'x-frame\|content-security'`).

## Adding the next app — checklist

1. `mkdir -p src/apps/<name>` + `manifest.js` + `<Name>.jsx`
2. Register in `apps/manifests.js` + `apps/components.js`
3. Icon at `public/icons/<name>.svg` (rounded square + accent glyph family)
4. `npm run build`, screenshot-verify in `vite preview`, deploy
