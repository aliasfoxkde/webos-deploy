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
│   ├── registry.js           app data: external defaults, store apps, plugin manifests,
│   │                         VIRTUAL_APPS (store/settings singletons); every row carries
│   │                         description/developer/category/rating
│   ├── state.jsx             reducer + persistence (webos.* keys), theme engine
│   │                         (THEME_PRESETS carry text/dim/chrome/paper/line/danger/
│   │                         focus, enforced by tests/contrast-audit.test.js),
│   │                         taskbar/desktop/widgets/volume/uiMode state, mobile detect
│   ├── personas.js           persona registry (id → preset + accent + taskbar side)
│   ├── db.js                 IndexedDB virtual disk (fileGet/filePut/fileList/…)
│   ├── snap.js               Meta+arrow tiling rectangles (zoneRect)
│   ├── wallpapers.js         CSS-only wallpaper pack + upload/URL dimming math
│   ├── bridge.js             dev-driver bridge (evalAsync envelope, screenshots)
│   ├── lens.js LensFilters.jsx  FX wallpaper filter pipeline (blur/brightness/…)
│   └── format.js             bytes/duration/number formatting helpers
├── shell/                    window-system UI
│   ├── Window.jsx            window chrome; 8-direction resize; plugin vs EmbedFrame
│   ├── ErrorBoundary.jsx     crash containment: soft per-window card + hard root
│   │                         boundary (a rejected lazy import or render throw
│   │                         renders a recovery card, never a blank desktop)
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
│   ├── ContextMenu.jsx       global right-click system (data-cm="kind:arg");
│   │                         useContextMenu reads the item builder at dispatch time
│   │                         (ref mirrored in a layout effect) — see the stale-builder
│   │                         regression in tests/shell-context-menu.test.jsx
│   ├── winDrag.js            window move/resize pointer-drag helpers
│   ├── Screensaver.jsx       idle screen saver (clock/photos/wireframe modes)
│   ├── SaverPreview.jsx      Settings mini-preview of the selected saver kind
│   │                         (reuses the fullscreen saver's implementations)
│   ├── FxWallpaper.jsx       canvas FX wallpaper layer (shares #wallpaper slot)
│   ├── WaterWallpaper.jsx    WebGL2 water wallpaper component (falls back to
│   │                         FxWallpaper waves when GL2/float targets miss)
│   ├── watergl.js            raw-WebGL2 wave-equation engine (clean-room port
│   │                         of webbg-demo; two RGBA16F ping-pong targets)
│   ├── Welcome.jsx           first-run overlay (webos.welcomed gate)
│   ├── AddApp.jsx            add-custom-app dialog (URL → desktop icon)
│   └── Calendar.jsx          clock popup with per-day events
└── apps/                     first-party plugins — one directory per app
    ├── manifests.js          data-only barrel (imported by os/registry.js)
    ├── components.js         component barrel (imported by shell/Window.jsx)
    ├── browser/   Chromium-style tabs + history + address bar (tabs.js urls.js
    │              BrowserApp.jsx);
    │              four-mode render stack — embed / direct frame / same-origin
    │              Pages-Function proxy / honest hand-off (see BROWSER.md)
    ├── terminal/  { manifest.js, Terminal.jsx }
    ├── video/     { manifest.js, VideoApp.jsx }
    ├── files/     virtual-disk file manager (list/upload/rename/delete, device view
    │              via File System Access, preview dispatch)
    ├── notepad/   notes store (notes.js) + autosaving editor, markdown preview
    ├── photos/    image viewer + transforms (rotate/flip/crop) over the Files disk
    ├── taskmgr/   task/performance manager (sysmon.js pure metrics)
    ├── chat/      AI chat adapter seam (provider-configurable)
    ├── editor/    CodeMirror 6 code editor
    │   ├── manifest.js
    │   ├── Editor.jsx      toolbar, buffer tabs, status bar, file IO
    │   ├── buffers.js      pure buffer reducer + localStorage persistence
    │   ├── language.js     ext→language map, theme + highlight style
    │   ├── markdown.js MarkdownView.jsx  pure markdown→tree + sanitized renderer
    │   │                                 (editor preview + notepad)
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
        ├── calculator.css    scoped styles (all colors via shell tokens — the
        │                     preset-aware audit fails on palette hexes here)
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
(iconSize, sort) · `groups` (desktop icon groups: `{ id: 'grp-…', name,
appIds }` — grouped icons leave the grid and live inside their folder tile;
`desktop.order` stores group ids too, uninstalling an app unfiles it) ·
`taskbar` (position bottom|top, align left|center|right — drives the
`data-tb-align` body attr that anchors the Start+apps group and the Start
menu (base CSS: left; center/right rules in styles.css; the 2.8 restyle's
wide menu deliberately no longer hard-codes its own anchoring), autohide,
labels, clock24, showDate, `pinned` app ids — drag icons onto the bar to
pin, drag within the bar to reorder — and `startPins` app ids for the
Start menu grid (right-click any Start row/tile → Pin/Unpin to Start;
defaults seeded from `DEFAULT_START_PINS`, cleaned on uninstall) · `widgets`
(enabled ids in display order) · `volume` (level, muted; broadcast to apps as a
`webos:volume` CustomEvent) · `uiMode` (auto|desktop|mobile) · `events` ·
`notes` · `weather.loc` + `weather.units` (metric|imperial; app and sidebar
widget flip together via the `webos:units` event) · plus per-app keys
(`webos.calc.*`, `webos.editor.state`).

### Bulk storage: IndexedDB (`os/db.js`)

Small JSON settings live in localStorage (`webos.*`); anything that can grow
lives in the IndexedDB database `webos` (`os/db.js`, promise-wrapped): the
`kv` store (SQLite database bytes) and the `files` store — the Files app's
virtual disk, keyed by path (`/Home/notes.txt`), folders as explicit marker
records (`{ dir: true }`) plus implicit path prefixes. The Terminal's
`sqlite` command runs real SQLite (sql.js WASM, loaded lazily with a Vite
`?url` wasm asset) against one database whose bytes are re-saved to
`kv['sqlite.db']` after every statement — it survives reloads.

### Files app

Two tabs: **WebOS disk** (the IndexedDB VFS — upload via button or
drag-and-drop onto the window, inline new-folder form, list with per-tile
download/delete, two-click folder delete, previews for text/image/video/audio/
pdf, browser storage quota in the footer) and **This device** (File System
Access API where available: session-only live browse of a real folder, files
read on demand, per-file **Import** copies into the VFS at the current path).
Nothing from the device tab persists unless imported — the footer says so.

### Desktop icon groups

Right-click desktop → **New group** creates a folder tile (2×2 preview of up
to four member icons). Dragging an app icon onto the tile files it into the
group (tile highlights, member leaves the grid); clicking the tile opens a
popup: rename inline, launch members, unfile per member, remove the group
(members return). Groups participate in drag-reorder and `Sort icons by name`
keeps them at the end.

### OS personas + welcome screen

`os/personas.js` holds one record per reference desktop (`win`, `mac`,
`linux`, `bsd`, `android`, `tui`) with its default theme preset, accent and
taskbar side. `webos.persona` lands on `<body data-persona>` (set in
`state.jsx`) and drives chrome through CSS only — per-persona
custom-property overrides (`--radius`, `--chrome-blur`, fonts) plus a small
behavioral block (mac traffic-light order/colors, GNOME centered titles,
tiling-WM borders instead of shadows, TUI monospace flat chrome).
`setPersona` applies the persona's one-shot defaults; user tweaks afterwards
win until re-applied.

`shell/Welcome.jsx` is the first-run overlay: brand + capabilities + the six
persona cards (picking one restyles the live shell behind it) + docs links.
Guarded by `webos.welcomed`, skipped for `?open=` deep links, reopened from
Settings → About via the `webos:welcome` window event. Shell version lives in
`src/version.js` (bump alongside `package.json` + `public/sw.js`).

### Granular interface settings (`webos.ui`)

`state.jsx` keeps a `ui` slice — `scale` (html font-size 85–125%),
`transparency` (multiplies the theme preset's chrome alpha via `withAlpha`),
`radius`/`blur` ('' = follow the persona, otherwise inline overrides on
`<body>` that beat persona rules), `anim` (body[data-anim-off] kills all
animation/transition), and `focusHover` (focus-follows-mouse: a `pointerover`
listener on `#windows` raises hovered windows; needs REAL pointer input —
synthetic `pointerover` doesn't drive it, so the driver uses CDP
`Input.dispatchMouseEvent`). Taskbar gains `align` (left/center) +
`iconSize` (sm/md/lg → body[data-tb-align]/[data-tb-ico]); desktop gains
`gap` (compact/normal/roomy → `--desk-gap`). Personas carry an `align`
default too. Everything persists under `webos.ui` / `webos.taskbar` /
`webos.desktop`.

### Browser plugin

`webos/src/apps/browser/` replaces the retired Firefox-in-WASM registry entry.
Pure logic (`urls.js` classification/embed rewrites, `tabs.js` reducer) is
separated from `BrowserApp.jsx` for unit tests. Framing politics and the
`/proxy` Pages Function: see BROWSER.md in this directory.

## Module index

One row per file under `webos/src/` — a contract enforced by
`webos/tests/docs-coverage.test.js`: the set of rows here must equal the
set of files on disk, so a new module cannot land undocumented and a
deleted one cannot leave a stale row. Per-area detail lives in the
sections above and below; this index is the complete file-level map.

- `src/App.jsx` — desktop root: window list, icon drag-reorder, context menus, properties dialog, widget sidebar, mobile drawer, deep links
- `src/main.jsx` — Vite entry: mounts the desktop into #root under the root ErrorBoundary
- `src/styles.css` — shell chrome stylesheet (desktop, windows, taskbar, popups, persona skins); the desktop label block is parsed by tests/contrast-audit.test.js
- `src/version.js` — single VERSION constant shown in the UI (bump alongside package.json and public/sw.js)
- `src/apps/components.js` — React component map for bundled plugins, keyed by app id — kept separate from manifests.js so the registry can import app data without pulling the component graph
- `src/apps/manifests.js` — bundled plugin manifests (data only, no React), merged into the registry
- `src/apps/browser/BrowserApp.jsx` — browser window UI: tabs, per-site embed classification, history, reload
- `src/apps/browser/manifest.js` — Browser plugin manifest (id, name, icon, default window size)
- `src/apps/browser/tabs.js` — pure tab/window reducer (open/close/activate, per-tab history, mode overrides) unit-tested without a DOM
- `src/apps/browser/urls.js` — URL intelligence: normalize typed input into a navigable URL and classify how a site may render in a WebOS window
- `src/apps/calculator/BasicKeys.jsx` — digit/decimal key set shared by the Standard and Scientific keypads
- `src/apps/calculator/Calculator.jsx` — calculator plugin shell: mode tabs, engine state wiring
- `src/apps/calculator/Display.jsx` — expression + result display, error surfacing
- `src/apps/calculator/Keypad.jsx` — per-mode key grid: dispatches the active mode layout to its key rows
- `src/apps/calculator/calcState.jsx` — calculator state reducer (expression, history, converter units, programmer registers) — pure and unit-tested
- `src/apps/calculator/calculator.css` — calculator styles (theme tokens only — a persona-aware audit fails on hardcoded palette hexes)
- `src/apps/calculator/manifest.js` — Calculator plugin manifest (id, name, icon, default window size)
- `src/apps/calculator/engine/errors.js` — CalcError taxonomy (lex/parse/eval) surfaced in the Display instead of thrown to the boundary
- `src/apps/calculator/engine/evaluate.js` — evaluator: walks the parser AST and reduces it to a number or a CalcError
- `src/apps/calculator/engine/format.js` — result formatting (grouping, precision, exponent thresholds)
- `src/apps/calculator/engine/functions.js` — function/constant table shared by lexer, parser and evaluator
- `src/apps/calculator/engine/index.js` — public barrel + compile(); the only import app code should use
- `src/apps/calculator/engine/lexer.js` — tokenizer: numbers, operators, parens, functions, constants
- `src/apps/calculator/engine/parser.js` — recursive-descent parser producing the AST
- `src/apps/calculator/engine/programmer.js` — BigInt bitwise evaluator for Programmer mode (word sizes, signedness, shifts)
- `src/apps/calculator/graph/PlotCanvas.jsx` — canvas function plotter for Graphing mode (sampling, axis ticks, zoom)
- `src/apps/calculator/modes/Converter.jsx` — unit converter (category factor tables, live two-way conversion)
- `src/apps/calculator/modes/Graphing.jsx` — Graphing mode UI (function list + PlotCanvas)
- `src/apps/calculator/modes/History.jsx` — calculation history list with entry reuse
- `src/apps/calculator/modes/Programmer.jsx` — Programmer mode UI (hex/dec/oct/bin, word size, bit ops)
- `src/apps/calculator/modes/Scientific.jsx` — Scientific keypad (functions, powers, memory)
- `src/apps/calculator/modes/Standard.jsx` — Standard keypad (BasicKeys + operators)
- `src/apps/chat/Chat.jsx` — chat window UI: transcript, composer, adapter status; streams adapter output token by token
- `src/apps/chat/adapters.js` — model integration seam — adapters are { id, label, ready, run } with AsyncGenerator streams
- `src/apps/chat/chat.css` — chat window styles (theme tokens only)
- `src/apps/chat/manifest.js` — Chat plugin manifest (id, name, icon, default window size)
- `src/apps/chat/store.js` — shared chat history (window + sidebar widget); localStorage-backed, capped, synced via the webos:chat window event
- `src/apps/editor/Editor.jsx` — text/code editor window: CodeMirror, buffer tabs, open/save pipeline with honest failure status
- `src/apps/editor/MarkdownView.jsx` — markdown preview renderer (token-walking React renderer — no raw HTML anywhere)
- `src/apps/editor/buffers.js` — buffer model: pure reducer + localStorage persistence; File System Access handles stay session-only and are never persisted
- `src/apps/editor/editor.css` — editor window styles (theme tokens only)
- `src/apps/editor/language.js` — language detection + CodeMirror extension/theme wiring
- `src/apps/editor/manifest.js` — Editor plugin manifest (id, name, icon, default window size)
- `src/apps/editor/markdown.js` — markdown tokenizer (headings, lists, fences, inline spans) feeding MarkdownView
- `src/apps/files/Files.jsx` — Files app: virtual-disk browser (grid/list views, drag-drop, new folder, upload/import/export, rename/delete, context menus)
- `src/apps/files/files.css` — Files window styles (theme tokens only)
- `src/apps/files/manifest.js` — Files plugin manifest (id, name, icon, default window size)
- `src/apps/notepad/Notepad.jsx` — sticky-note scratchpad window backed by notes.js
- `src/apps/notepad/manifest.js` — Notepad plugin manifest (id, name, icon, default window size)
- `src/apps/notepad/notepad.css` — Notepad window styles (theme tokens only)
- `src/apps/notepad/notes.js` — note store: pure functions + debounced localStorage autosave
- `src/apps/photos/Photos.jsx` — image viewer: disk library, viewer stage, transform/adjust/markup panels
- `src/apps/photos/imops.js` — pure image ops: path triage, rotate/flip/crop math, tonal adjust baking, annotation rendering, canvas output
- `src/apps/photos/manifest.js` — Photos plugin manifest (id, name, icon, default window size)
- `src/apps/photos/photos.css` — Photos window styles (theme tokens only)
- `src/apps/taskmgr/TaskManager.jsx` — Task Manager: process cards + Performance tab (heap, loop lag, frame rate, long tasks)
- `src/apps/taskmgr/manifest.js` — Task Manager plugin manifest (id, name, icon, default window size)
- `src/apps/taskmgr/sysmon.js` — honest web metrics (heap, event-loop lag, fps, PerformanceObserver long tasks) + pure formatters
- `src/apps/taskmgr/taskmgr.css` — Task Manager window styles (theme tokens only)
- `src/apps/terminal/Terminal.jsx` — wosh terminal on xterm.js: prompt, history, pipelines, builtin dispatch over wasm coreutils
- `src/apps/terminal/coreutils-commands.js` — the JS-eval fallback implementations used when the wasm image lacks a utility
- `src/apps/terminal/coreutils.js` — coreutils.wasm loader + dispatch (wasi host wiring, seeded filesystem)
- `src/apps/terminal/lineedit.js` — pure readline-style line-editing transitions (buffer + cursor) unit-tested without a DOM
- `src/apps/terminal/manifest.js` — Terminal plugin manifest (id, name, icon, default window size)
- `src/apps/terminal/paths.js` — path presentation (~ prompt, ~-expansion) over the Files disk root
- `src/apps/terminal/pipes.js` — quote-aware pipe splitter: a line becomes segments, or null on an unterminated quote
- `src/apps/terminal/wasi.js` — MemFS + WasiHost: the Files-disk-backed filesystem handed to the wasm image
- `src/apps/video/VideoApp.jsx` — video player window: builds /embed/ URLs from a pasted link or ID, plus presets
- `src/apps/video/manifest.js` — Video plugin manifest (id, name, icon, default window size)
- `src/apps/weather/WeatherApp.jsx` — weather window: current conditions + 7-day forecast, unit toggle, stored location
- `src/apps/weather/WxIcon.jsx` — hand-drawn SVG weather glyphs shared by the window and the sidebar widget
- `src/apps/weather/api.js` — Open-Meteo client (keyless, no CORS): geocoding + forecast; network errors surface as thrown Errors for the UI
- `src/apps/weather/manifest.js` — Weather plugin manifest (id, name, icon, default window size)
- `src/apps/weather/weather.css` — Weather window styles (theme tokens only)
- `src/os/LensFilters.jsx` — SVG filter chain that renders the lens displacement maps for the Liquid Glass refraction
- `src/os/bridge.js` — postMessage app-storage bridge (private /Apps/<id>/ folders) and the dev-driver bridge (evalAsync envelope, screenshots)
- `src/os/db.js` — IndexedDB virtual disk (fileGet/filePut/fileList/…) shared by Files, Terminal and the bridge
- `src/os/format.js` — shared byte/duration/number formatting helpers
- `src/os/lens.js` — pure lens displacement-map math (SDF shapes, band neutrality, stable filter ids)
- `src/os/personas.js` — persona registry (id → theme preset + accent + taskbar side), applied to <body data-persona>
- `src/os/registry.js` — app data: external defaults, store rows, plugin manifests, VIRTUAL_APPS singletons; every row carries description/developer/category/rating
- `src/os/snap.js` — snap zones (edge halves, corner quarters, top maximize) and Meta+arrow tiling rectangles
- `src/os/state.jsx` — OS reducer + webos.* persistence, theme engine, taskbar/desktop/widgets/volume/uiMode state, mobile detect
- `src/os/themes.js` — theme token presets (text/dim/chrome/paper/line/danger/focus) — every pair is WCAG-audited by tests/contrast-audit.test.js
- `src/os/wallpapers.js` — CSS-art wallpaper pack (clean-room by construction) + upload/URL dimming math
- `src/os/waterfx.js` — parameter model for the water wallpaper (wave-equation sim params, presets) shared by UI and GL engine
- `src/os/wpcompose.js` — composite wallpaper model: layered base/pattern/effect/floats spec + pure layout math
- `src/shell/AddApp.jsx` — Add-app dialog: custom URL/name/icon persisted as a user app
- `src/shell/AppStore.jsx` — App Store window: catalog, ratings, detail view, install/uninstall
- `src/shell/Calendar.jsx` — tray calendar popup (month navigation, today highlight, day selection)
- `src/shell/CompositeWallpaper.jsx` — renders the composited wallpaper layer from wpcompose specs (base, pattern, effect, floats)
- `src/shell/ContextMenu.jsx` — global right-click system (data-cm="kind:arg" targets; the item builder is read at dispatch time via a ref mirror)
- `src/shell/EmbedFrame.jsx` — iframe host for plugin/external apps: bridge wiring, load-timeout honesty panel, file-storage glue
- `src/shell/ErrorBoundary.jsx` — render-crash containment: soft per-window card + hard root boundary (a rejected lazy import never blanks the desktop)
- `src/shell/FxWallpaper.jsx` — canvas FX wallpaper layer (pointer parallax, reduced-motion gates) sharing the wallpaper slot
- `src/shell/MobileDrawer.jsx` — full-screen app grid for mobile mode
- `src/shell/Properties.jsx` — app property sheet (registry row, stars, actions) opened from any icon/taskbar/titlebar menu
- `src/shell/SaverPreview.jsx` — Settings mini-preview of the selected screen-saver kind (reuses the fullscreen implementations)
- `src/shell/Screensaver.jsx` — idle screen saver (clock/photos/wireframe modes)
- `src/shell/Settings.jsx` — Settings window: section navigation over the Panels + Appearance views
- `src/shell/Sidebar.jsx` — widget sidebar (weather/clock/battery/events/notes/storage; enable + reorder persisted)
- `src/shell/StartMenu.jsx` — Start menu: search, pinned apps, power actions
- `src/shell/Taskbar.jsx` — taskbar + tray popups (volume/network via body portals), clock config, position/autohide via body[data-tb]
- `src/shell/WaterWallpaper.jsx` — interactive water wallpaper host: canvas lifecycle, pointer input, watergl engine + waterfx params
- `src/shell/Welcome.jsx` — first-run welcome screen and persona chooser
- `src/shell/Window.jsx` — window chrome: 8-direction resize, titlebar drag, plugin vs EmbedFrame content, focus/z-order hooks
- `src/shell/watergl.js` — WebGL water simulation (wave equation, pointer ripples) behind WaterWallpaper; falls back to a 2D canvas render
- `src/shell/winDrag.js` — shared titlebar move-drag with snap-zone integration (used by Window.jsx and the virtual windows in App.jsx)
- `src/shell/settings/Appearance.jsx` — Appearance panel: persona/theme pickers, chrome knobs, the wallpaper studio (composite builder)
- `src/shell/settings/Panels.jsx` — remaining Settings sections (desktop/taskbar/widgets/sound/network/apps/storage/about) + shared section controls

## Liquid Glass design language (win/mac)

The win and mac personas layer a four-phase glass treatment (plan:
`LIQUID-GLASS.md`), all of it CSS/attribute-driven so the `:where()`
specificity contract above still holds:

- **Frost + rims (LG1/LG2).** Shared custom properties (`--chrome`,
  `--glass-rim-hi/lo`, `--glass-sat`) and per-preset `--paper` (opaque
  document fill — window bodies must not go dark-on-dark in light themes;
  `--panel` derives from it via `color-mix`). The focused window wears a
  specular rim as a `::after` inset-shadow overlay (`content: none` when
  maximized) so box-shadow stays owned by the Settings shadow knob. The
  widgets sidebar is the "clear" variant: wallpaper shows through the rail,
  each widget carries a near-opaque scrim for text contrast.
- **Motion (LG3).** `rise-in`/`drop-in`/`unfold-in` keyframes — transform +
  opacity only, <=180 ms, anchored to the taskbar side
  (`body[data-tb="top"] #start-menu` outranks the base `#start-menu` rule,
  (1,1,0) vs (1,0,0)). Gated by both `body[data-anim-off]` and
  `prefers-reduced-motion`.
- **Refraction (LG4).** `os/lens.js` is pure map math — signed distance to a
  rounded-rect boundary (sdRoundBox **with** the trailing `- r` term), axis
  and radial edge normals, a convex squircle profile — rasterised into an
  feDisplacementMap where 128/128 is neutral (the buffer is pre-filled;
  untouched pixels must read zero displacement, not a full-scale shift).
  `os/LensFilters.jsx` measures `#taskbar`/`#start-menu`, encodes each map to
  a PNG data URL and swaps it into one persistent `<filter>` per surface
  (ResizeObserver + MutationObserver, 150 ms debounce); static CSS references
  the ids under `body[data-lens="on"]`, set only once a map exists so the
  `url(#…)` never dangles. Ships behind a
  `CSS.supports('backdrop-filter', 'url(#…)')` probe — Chromium engages it,
  Safari/Firefox keep the base frost. `-webkit-backdrop-filter` deliberately
  omits the `url()` (Safari rejects the whole value otherwise), and the
  `data-lens` rules sit before the reduced-transparency media block so that
  gate still wins the tie.

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

- Quality gates (in `webos/`): `npm run lint` (zero warnings) →
  `npm run coverage` (vitest + enforced ratchet floors in
  `webos/vitest.config.js`, includes the WCAG contrast auditor) →
  `npm run build`. `npm run ci` chains all three; CI runs them on GitHub
  (`.github/workflows/ci.yml`, push/PR/manual) and locally via GitForge
  (`.gitforce.yml`, single-ordered-job mirror).
- Tests: `npm run test` (1015 specs across 67 files, happy-dom + Testing
  Library); single file: `npx vitest run tests/<name>.test.jsx`.
  `tests/docs-coverage.test.js` additionally pins the Module index to the
  tree (every file under `src/` needs a row, and vice versa).
- Build: `npm run build` in `webos/` → `dist/` (static, base `./`).
- Deploy: `npx wrangler pages deploy dist --project-name artcraft-webos --branch main`
  (see `packaging/HOSTING.md` and the root `README.md` for the full procedure and live URLs).
- Preview locally: `npm run preview` (port 5180).
- Icons: hand-written SVGs in `webos/public/icons/`, rasterized via
  `packaging/icons-render.sh` (headless Chromium; ImageMagick cannot stroke SVG).
- App Store additions: append a row to `STORE_APPS` in `os/registry.js`
  (verify embeddability first: `curl -sI <url> | grep -i 'x-frame\|content-security'`),
  plus a hand-drawn glyph at `public/icons/<id>.svg` — a registry test asserts
  every icon path resolves on disk, so the row and the file land together.
  Fourth wave (3.8.0): Piskel, BeepBox, CyberChef, Graphviz Online; SculptGL
  now serves from `sculpt.cyopsys.com` (SAMEORIGIN → opens in its own tab).

## Adding the next app — checklist

1. `mkdir -p src/apps/<name>` + `manifest.js` + `<Name>.jsx`
2. Register in `apps/manifests.js` + `apps/components.js`
3. Icon at `public/icons/<name>.svg` (rounded square + accent glyph family)
4. `npm run build`, screenshot-verify in `vite preview`, deploy

## AI chat — the adapter seam (2.7.0)

`src/apps/chat/` is a full plugin app (manifest/Chat.jsx/chat.css) plus a
sidebar widget and a start-menu "✦ Ask AI" hook — but **it ships with no
model and must never fake one**. The honesty rule is product-level: the app
badges itself "No model configured", shows a `.c-note` banner, and the echo
adapter's reply says exactly what is missing and where to wire a provider.

- **Adapter contract** (`adapters.js`): `{ id, label, ready(): bool,
  run(messages, { signal }): AsyncGenerator<string> }`. `run()` yields text
  chunks; Chat.jsx renders them as they arrive and persists the finished
  message once (not per chunk). `ADAPTERS` + `adapterById()` (selected via
  `webos.chat.adapter`, default `echo`). Wiring a real provider = one new
  file entry, no component changes.
- **History** (`store.js`): `webos.chat.history` (localStorage, capped at
  100 messages), written once per completed exchange; `saveHistory()`
  broadcasts `webos:chat` so the sidebar widget and app window stay in sync
  without a shared store. `onHistory(fn)` returns an unsubscribe.
- **Sidebar widget** (Sidebar.jsx `ChatWidget`): last 3 messages truncated
  to 90 chars, "Open AI Chat" + Clear (clears the whole thread — both
  surfaces re-render from the same event).
- Sending aborts cleanly: Stop uses an `AbortController`; aborted runs keep
  the user message and mark partial assistant text "(stopped)". Errors append
  an "The adapter failed — …" assistant message instead of throwing.

## Start menu overhaul (2.8.0)

Search-first Start (`shell/StartMenu.jsx`): search box on top; typing
switches to a results view — the ✦ Ask AI row, matching apps (name/tagline/
category), and matching Settings sections. Enter launches the first hit.
The browse view (empty query) shows a Pinned grid (`DEFAULT_PINNED`,
drag-reorder + persistence still open), a Recommended row driven by
`webos.recents` (launch order, capped 8, persisted in the `launch` reducer
case), All apps grouped by `app.category` (fixed `CATEGORY_ORDER` display
order), an App Store/Settings links block, and a footer with the user chip
+ power menu (Restart = `location.reload()`, Shut down = the `#halt`
overlay in App.jsx — honest about being a browser page, "Power on" reloads).

- **Launch args**: `os.launch(id, args)` stores `args` on the window record;
  plugin windows render `<Plugin args={...} />`, virtual windows pass
  `win.args` (Settings reads `args.initial` to deep-link a section —
  `SECTIONS` is exported for the search index).
- **Persona styling stays CSS-only**: `body[data-persona]` rules — win =
  centered 580px panel, linux/bsd = left-anchored, mac = raised over the
  dock, tui = full-width monospace column.

## Terminal 3.0 — wosh on xterm.js (2.9.0)

`src/apps/terminal/Terminal.jsx` is now an xterm.js frontend (MIT,
`@xterm/xterm` + `@xterm/addon-fit`, imported by the already-lazy Terminal
chunk — xterm downloads only on first launch) driving `wosh`, a real command
language over the OS: `help apps open|launch close windows install|uninstall
store settings [section] get/set <path> <value> persona[s] theme accent
wallpaper volume os sqlite history fullscreen date echo uname whoami neofetch
clear`, plus tab completion (commands, app ids, settings paths, personas,
themes, settings sections), ↑/↓ history (last 100), Ctrl+C (cancel line) and
Ctrl+L (clear). Unknown input still evaluates as JavaScript with the live OS
context in scope — the escape hatch. Every command mutates real OS state;
`set` echoes the coerced value returned by the setter (never a stale render
read). Command execution is serialized (`busy` gate) so async commands like
`sqlite` (sql.js, lazy) can't interleave with input.

**Craft MCP bridge — audit result (3.1, blocked upstream):** the web craft
builds have NO control surface today. `vectorcraft/apps/vectorcraft-web/src/
main.rs` documents it: "no TCP control server (browsers can't listen on
sockets)" — and there is no postMessage/JS bridge either. Until the craft
repos add a web channel (a `window.postMessage` bridge in the eframe web
runner is the natural shape), `craft <app> <command>` can't exist. The wosh
command envelope is deliberately MCP-shaped (`{ method, params }` over
`get/set` paths) so an external AI client can drive the same surface, and a
future bridge drops in without changing the shell.

**v86 Linux mode** stays tracked for 3.1 (CDN-fetched image at the user's
request; keeps CSR purity).

## Real assets — icons, photo wallpapers, FX wallpapers, store wave 3 (3.0.0)

The "no half-assing" assets batch. Three asset classes moved from CSS-only to
real content, plus a third App Store wave.

**Craft app icons.** Each sibling craft repo ships `assets/app-icon/<app>-1024.png`
(original artwork by the project owner, Apache-2.0 OR MIT). Those are resized
to 256 px into `webos/public/icons/craft/<app>.png` and the registry
rows now point at them instead of placeholder SVGs. They are the projects'
own marks — used to launch the apps they identify. License rows live in
`docs/ATTRIBUTION.md` (kept out of `public/` per the scaffolding rule; the
bundle itself stays attribution-free).

**Wallpaper photos.** Eight CC-licensed photographs from Wikimedia Commons
lived in `webos/public/wallpapers/photos/*.jpg` at 1920 px (dunes, alpine
lake, aurora, sea cliffs, misty forest, canyon, Milky Way, tropical beach).
`WALLPAPERS` gained a `Photos` category whose entries carry
`img: './wallpapers/photos/….jpg'` (relative — the site must work from any
sub-path/iframe). Fetching script pattern: Commons API search →
`imageinfo` license filter (public domain / CC0 / CC BY / CC BY-SA only) →
1920 px thumb download; the shared-IP rate limit needs ~21 s between
requests. Every photo has a row in `docs/ATTRIBUTION.md` — do not add a
photo without adding its row in the same change.

**FX wallpapers.** `theme.wallpaper = 'fx:<kind>'` mounts
`shell/FxWallpaper.jsx`, a full-viewport canvas at z-index −1 with five
code-drawn effects (starfield, aurora, tide, mesh, code rain) — deterministic
per kind (seeded PRNG), pointer parallax, DPR capped at 1.5, paused on
`visibilitychange`, a single static frame under `prefers-reduced-motion`.
Gotcha that shaped the API: assigning an invalid inline CSS value through the
CSSOM is a silent no-op, so `wallpaperLayer()` returns `null` for `fx:*` and
the `#wallpaper` div unmounts instead of carrying a stale photo background
over the canvas. The Appearance grid generalised to three kinds: `css`
(CSS art), `img` (bundled photos), `fx` (interactive; swatch shows a static
representative gradient).

**Water wallpaper (`fx:water`).** A sixth, GPU-interactive FX: a wave-
equation sim on two RGBA16F ping-pong targets — `shell/watergl.js`, a
clean-room raw-WebGL2 port of the org's `webbg-demo` (same math, Three.js
replaced by one fullscreen triangle per pass). The pointer brushes pressure
into the sim (ripples follow the cursor), clicks drop gaussian impulses,
`water.rain` schedules ambient drops; the output pass refracts a gradient
background through the sim's pressure gradients with specular, chromatic
aberration, grade and grain. The param tree (`os/waterfx.js`: bg / water /
optics / grade / overlay groups, five presets) is validated on merge —
unknown keys and wrong types from persisted state are dropped, so a stale
blob can never poison the uniforms. Resolution: `theme.water` holds a user
patch, `theme.waterPreset` a preset name; `resolveParams` layers
DEFAULTS < patch < preset. The component bridges window-level pointer
input (the wallpaper sits behind every window), scales the sim at
`water.simScale` of the viewport, and falls back to the 2D Tide FX when
WebGL2 or float render targets are missing (probed once, at first render).
Settings → Appearance exposes the tuning surface: a search field over the
picker, an FX animation-speed multiplier (`theme.fxSpeed`, all `fx:*`
kinds), and — while `fx:water` is active — preset chips plus curated
sliders/color pickers that write validated patches into `theme.water`
(`mergeParams(DEFAULTS, {...patch, group})` — a partial stored patch
normalizes on first edit instead of dropping edits).
Reduced motion draws one calm static frame (`motion="gentle"` — the screen
saver passes 0.35× speed instead of freezing). Driver hook:
`?water-debug` exposes `window.__water` with live sim counters.

**App Store wave 3.** Eight third-wave store entries: 2048 (the original
Gabriele Cirulli MIT build), Hextris, Untrusted, HexGL, Excalidraw, tldraw,
Squoosh, Photopea. Each URL was probed for `X-Frame-Options` /
CSP `frame-ancestors` before being added — all eight allow framing, so they
run embedded (`embed: true`). Icons are WebOS-drawn glyphs in the house style
(64×64 rounded rect, dark gradient, accent line art) — never vendor marks;
names and links are referential. Rejected: `play2048.co` (frame-ancestors
allow-list blocks us).

### 3.1.0 — systematic persona skins, chrome knobs, look & layout reset

**Persona skins became systematic.** Every persona now sets four design
tokens (`--radius`, `--chrome-blur`, `--ctl-radius`, `--menu-radius`) and a
`.chip/.btn` + `.ctx-menu/.gp/#start-menu/#snap-preview` consumer pair turns
them into per-persona control shaping. On top sit persona-specific chrome
skins: mac (traffic-light dot buttons, absolutely centred title, floating
centred dock), linux (GNOME headerbar: centred title, pill buttons, calm
focus ring), bsd (hairline borders, zero radii, mono titles, no shadows),
android (inset pill dock, round buttons, 999 px search/user pills), tui (flat
mono panels, accent borders, CRT scanline overlay). Floating docks carry
their own autohide transforms — the combined
`translate(-50%, …)`/inset-pill variants must exist per persona because the
generic `body[data-tb-autohide] #taskbar` rules would otherwise win or
mis-place them.

**Specificity contract (learned the hard way).** Persona skin rules wrap the
persona attribute in `:where(...)` — `:where(body[data-persona="mac"]) .tb-btn`
— so only the part OUTSIDE contributes specificity and explicit user-override
rules (`body[data-tbside="left"] …`, `body[data-font="mono"]`, declared later
in the file) always win ties. The trap: when the rule has NOTHING outside the
`:where()` (e.g. `:where(body[data-persona="tui"]) { font-family: … }`) the
whole selector is specificity **zero** and loses to the base `body` rule
(0,0,1) regardless of source order — the tui mono UI font silently never
applied until the attribute was moved outside (`body[data-persona="tui"] { …
}`). Custom-property-only blocks keep the `:where()` form; anything that must
outrank an element/class base rule does not.

**Chrome knobs.** Four user knobs follow the empty-string-means-persona
convention: `ui.tbSide` (window buttons left/right), `ui.titleAlign`,
`ui.font` (rounded/mono/serif stacks), `ui.shadow` (off/soft/deep), each
rendered as `data-*` on `<body>` and overridable per persona. All four are
exposed in Settings → Appearance ("Window chrome") and as terminal
`wosh` paths (`ui.tbSide`, `ui.titleAlign`, `ui.font`, `ui.shadow`), plus the
pre-existing `volume.master`/`volume.mute` paths were fixed (they read/wrote
nonexistent `master`/`mute` keys instead of `level`/`muted`).

**Reset surfaces.** Settings → About gained "Reset look & layout"
(persona, theme, ui, taskbar-position, desktop, widgets, volume slices back
to their `DEFAULT_*` consts — installed apps, pins, groups, files kept) and
"Factory reset…" (wipe every `webos.*` localStorage key + reload), the latter
shared with the Storage panel via the exported `factoryReset()` in
`state.jsx` — one implementation, two entries.

Validation: `scripts/screenshot-drive.mjs` steps 34–35 sweep all six personas
(dataset + `--radius` + computed font per persona, screenshots), apply the
four knobs to a live window (flex-direction, title position, box-shadow,
font), then drive About → "Reset look & layout" with an auto-accepted confirm
and assert the state slices land back on defaults.

### 3.2.0 — taskbar grouping, window placement, single-instance apps

**One taskbar button per app.** The old split (pinned buttons + one button
per running unpinned window) became a unified list: pinned apps first (pin
order), then running unpinned apps in launch order. A click launches when
nothing is running, toggles minimize/focus with a single window, and cycles
focus across several. `Taskbar.jsx` renders `data-cm="app:<id>"` on every
button; only pinned buttons carry `data-pin` (drag-to-reorder unchanged).

**One context menu for every taskbar app.** `App.jsx` replaces the divergent
`pin:`/`taskapp:` menus with a single `app:` case whose shape is the same
whether or not the app is pinned — the gap this fixes: a pinned app's
running windows previously had no close affordance at all. Items: one entry
per window (activate/restore), "Open in new tab" (url apps), "New window"
(omitted for single-instance apps), pin/unpin, Properties, and
"Close (all) window(s)".

**Window placement.** The old global cascade (every new window +28 px from
top-left regardless of app) became: the first window of an app opens
centred; each further window of the SAME app cascades by a constant +28 px
step from the previous (wraps after 7 so the chain never walks off-screen).
Different apps all centre. Computed against `innerHeight - 52` so the
taskbar doesn't cover a centred window.

**`singleInstance` app property.** Registry/plugin manifests can declare
`singleInstance: true`; `launch` then focuses and un-minimises the running
window instead of opening a second one (mobile path included). Marked on
mail, editor, weather, video, discord, spotify, chatgpt; user-created apps
get a "Single instance" checkbox in the Add/Edit dialog, and Properties
shows a "Windows: Single instance/Multiple" row.

**Taskbar right-click → Taskbar settings.** The taskbar's own context menu
gained a direct deep link: `os.launch('settings', { initial: 'taskbar' })`
(Settings resolves `args.initial` against its section ids).

Validation: driver step 35 groups two calc windows (one button, dot, both
windows), reads the menu items, closes all from the menu, asserts the
centred first rect and the +28/+28 second rect, launches weather twice
(1 window, 1 button), and drives the deep link into the Taskbar section.

### DeckCraft joins the desktop (3.2.0)

DeckCraft 0.4.0 (clean-room presentation suite) is now a default app: registry
row → `https://deckcraft-web.pages.dev/`, icon `icons/craft/deckcraft.png`
(256 px downscale of its `assets/app-icon/deckcraft-1024.png`, Apache-2.0 OR
MIT, attributed in `docs/ATTRIBUTION.md`). Unlike the other eight craft apps
it has no upstream release zip yet — the site was built locally from the
source checkout at `apps/deckcraft/` (`trunk build --release`, own
`CARGO_TARGET_DIR` on NVMe) and deployed to a dedicated Pages project
`deckcraft-web`. The 24 MB wasm sits just under the 25 MiB Pages per-file
limit, so no R2 pass-through is needed. Two guards recorded:
`packaging/fetch-apps.sh` deliberately does NOT list deckcraft (its
`--force` path does `rm -rf apps/<name>`, which would delete the checkout —
add the entry only after the checkout is gone and releases exist), and the
Pages project needed `wrangler pages project create` first (newer wrangler
no longer auto-creates on deploy). Boot verified headlessly: wasm binds,
loading screen clears, zero console errors.

### Screen saver (3.3.0)

New `Screensaver` shell component (mounted last in `App.jsx`, overlay
`#screensaver` z 1900 — above modals (950) and persona scanlines (1500),
below the halt screen (2000); `cursor: none`). State slice `os.saver` =
`{ kind, timeoutMin, speed, photoSecs }` (default off / 10 min), edited in
Settings → Screen saver and included in Reset look & layout. Kinds: the five
FX canvases (reusing `FxWallpaper`, which gained `id` and `speed` props so
the saver canvas doesn't collide with `#fx-wallpaper`), a photo slideshow
over the bundled CC wallpapers (key-remount fade-through-black — no stacked
layers), and a big clock following the taskbar's 12/24-h setting.

Idle model: a ref timestamp bumped by passive window listeners
(pointermove/down, keydown, wheel); a 1 s interval activates after
`timeoutMin` minutes (skips while `document.hidden`); `webos:saver-preview`
(CustomEvent) activates immediately for the Settings "Preview now" button and
the driver. Dismissal while active: pointerdown/keydown instantly;
pointermove only after 24 px of travel from the first-seen point, so the
settling jitter that activated it can't instantly dismiss it.

### App Store persona skins (3.3.0)

One JSX tree, per-persona layout via a `body[data-persona="…"] .store-*` CSS
block (attribute OUTSIDE `:where()` — these rules must outrank the base
`.store-*` class rules; same contract as the persona token block):

- **win → Microsoft Store**: 10 px hero, squared "Get" buttons (4 px, min
  width), cards lift on hover with an accent-tinted border.
- **mac → Mac App Store**: 1.55 rem title, soft 16 px cards, pill (999 px)
  uppercase GET/OPEN/DELETE buttons.
- **linux → GNOME Software**: flat 12 px tiles, quiet accent left-border hero
  ("Editor's pick").
- **android → Play**: pill search (999 px, wider), 20 px cards, 26 px hero,
  pill Install buttons.
- **bsd/tui → dense list**: hero hidden, grid becomes a single-column
  bordered list, tag chips hidden, buttons become accent-outlined bracket
  verbs.

Wording follows each platform's store convention via a `LABELS` map in
`AppStore.jsx` (MS "Get", Apple "GET", terminals speak `[ install ]`); a
featured hero (highest-rated listing, stable by name) shows the full
description + rating above the grid, hidden when searching or filtering.
Driver step 37 asserts per-persona hero radius/display, kicker, button label
and radius for all five skins; step 36 drives the saver (section deep link,
FX preview + z-index + pointerdown dismissal, clock preview, and the photos
kind is probed separately: slider gating, slideshow advance, dismissal).

### Real utilities in wosh: coreutils.wasm (3.4.0)

The terminal gains a real-utility layer: `webos/vendor/coreutils.wasm` is the
uutils coreutils multicall binary (wasm32-wasip1, MIT — attribution row in
`docs/ATTRIBUTION.md`), 78 utilities (`ls`, `cat`, `wc`, `seq`, `sort`,
`sha256sum`, …) listed by the new `utils` help command. `rustybox` (the other
candidate) was audited and rejected: it is a c2rust mechanical transpile of
GPL-2.0 BusyBox with `llvm_asm!` and a Linux syscall layer — no wasm target
and a license conflict with the clean-room rules.

Layers (all in `src/apps/terminal/`):

- **wasi.js** — hand-rolled WASI preview1 shim over an in-memory disk
  (`MemFS`, ~300 lines, no deps): preopen root at fd 3, fd table, stat/dirent
  layouts, `poll_oneoff` fires immediately (sleep is a no-op), fd_write caps
  at 128 KB stdout / 16 KB stderr (`{wasiCap}` throw traps runaway streams
  like `yes`; the runner reports `truncated`). Preview1 gotcha encoded in a
  comment at `path_open`: oflags/fdflags are **scalar** parameters — only the
  opened-fd out-param is a memory pointer.
- **coreutils.js** — one lazy fetch + `WebAssembly.compile`, then **async
  `WebAssembly.instantiate` per run** (Chrome forbids sync
  `new WebAssembly.Instance` on the main thread once wire bytes exceed 8 MB;
  this module is ~10.3 MB). Fresh instance per invocation resets globals; a
  wasm trap surfaces as exit 134 with the trap text on stderr. The disk is
  seeded from the Files store before the first run and written back after
  any run that mutated it — reference comparison against the seeded byte
  arrays decides exactly which files/dirs to put or delete.
- **Terminal.jsx** — dispatch order: wosh builtins first (echo/date/pwd stay
  OS-wired), then the wasm utility, then the JS-eval fallback.
  `coreutils <util> …` forces the wasm path past a shadowing builtin.

Path model (v1, documented in the shell help): the disk root `/` **is** the
Files store root, so relative arguments resolve there and absolute paths
(`/Home/notes.txt`) always work; there is no `cd`/`pwd` state yet. stdin is
empty (reads hit EOF), unix-gated utilities (chmod, df, du, env, kill, stat)
are absent from the default-features build. Driver step 38 seeds files via
IndexedDB, types real keystrokes at xterm, and asserts wasm output
(`seq`, `ls`, `cat`, `wc`), the builtin-precedence escape hatch, write-back
persistence (the `mkdir`'d directory is read back from IndexedDB), and the
JS-eval fallback.

### Liquid Glass design language (3.6.0)

The win/mac personas gained the four-phase glass treatment described in
"OS personas" above (frost tokens, focused-window specular rim, `--paper`
document fill fixing the Daylight dark-on-dark defect, anchored
rise/drop/unfold motion with reduced-motion gates, and the Chromium-only
feDisplacementMap edge refraction shipped behind a `CSS.supports` probe).
LG work was driven by `LIQUID-GLASS.md`; the lens map math is pure
(`os/lens.js`) and unit-tested (`tests/lens.test.js` — 11 tests covering SDF
sign conventions, band neutrality, inward displacement directions, corner
behaviour, and the stable filter ids CSS references).

### FireCraft joins the desktop (3.15.0)

The twelfth craft app — FireCraft, the clean-room Fireworks CS6
reimplementation (hybrid vector + bitmap web design) — became a default
app. Unlike the first eleven it has **no upstream release zips and no
checkout here**: its web bundle deploys from its own repository checkout
(`/nas/Temp/repos/FireCraft`, independent git repo, wasm release target)
via that repo's own dist pipeline (`cargo run -p xtask -- dist --web`,
which enforces the wasm size budget and runs a bridge smoke against the
release bytes, plus a `MANIFEST.sha256` over the output) to the
`firecraft-web` Pages project. The registry row is a plain external
default (`embed: true`); embedding needs no special casing because the
bundle ships no frame-hostile headers and Pages serves the wasm as
`application/wasm`.

The bundle carries a documented postMessage bridge (its `docs/WEBOS.md`):
inbound `openDocument{bytes}` / `apply{name,payload}` / `exportPng` /
`exportDocument` / `ping`, outbound replies filtered on
`source: "firecraft"`. WebOS currently uses only the `ready` liveness
signal (verified end to end in real Chromium: desktop icon → live iframe →
`ready` → full editor UI); deeper integration (autosave into the Files
disk, open-with, export hand-off) is planned work — see
`docs/planning/HANDOFF.md` phase H2.

The app mark (`public/icons/craft/firecraft.png`) is original code-drawn
art (`packaging/icons-src/firecraft.svg`, flame mid-vector-edit) rasterized
with the headless-Chromium technique — FireCraft ships no upstream mark
yet; swapping it in later is HANDOFF phase H3.
