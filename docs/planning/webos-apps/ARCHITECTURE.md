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
    │              safe rendering stack — official embed / cross-origin frame
    │              / explicit browser-tab hand-off; no same-origin proxy (see BROWSER.md)
    ├── terminal/  { manifest.js, Terminal.jsx }
    ├── video/     { manifest.js, VideoApp.jsx }
    ├── files/     virtual-disk file manager (list/upload/rename/delete, device view
    │              via File System Access, preview dispatch)
    ├── notepad/   notes store (notes.js) + autosaving editor, markdown preview
    ├── photos/    image viewer + transforms (rotate/flip/crop) over the Files disk
    ├── taskmgr/   task/performance manager (sysmon.js pure metrics)
    ├── chat/      AI Workspace: chat adapter plus optional Page Agent browser-agent view
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
        ├── calculator.css    scoped styles (all colors via shell tokens — the        │                     preset-aware audit fails on palette hexes here)
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
(`webos.calc.*`, `webos.editor.state`, `webos.pageAgent.config`). The Page Agent
extension authorization token uses its required origin-local storage slot and is
not synced; provider API keys remain in memory only.

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

`webos/src/apps/browser/` replaces the retired Firefox-in-WASM registry entry.Pure logic (`urls.js` classification/embed rewrites, `tabs.js` reducer) is
separated from `BrowserApp.jsx` for unit tests. Framing politics and the
cross-origin framing limits and safe browser-tab hand-off: see BROWSER.md in this directory.

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
- `src/apps/chat/PageAgentPanel.jsx` — optional Page Agent extension UI: provider setup, authorization, task consent, execution status and results
- `src/apps/chat/adapters.js` — model integration seam — adapters are { id, label, ready, run } with AsyncGenerator streams
- `src/apps/chat/chat.css` — chat window styles (theme tokens only)
- `src/apps/chat/manifest.js` — AI Workspace plugin manifest (id, name, icon, default window size)
- `src/apps/chat/pageAgentBridge.js` — validated adapter for the official Page Agent extension API; stores no provider API key
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
- `src/shell/SaveDialog.jsx` — shared save-as dialog for export handoffs: filename input over a blurred backdrop, calls onSave with the chosen name; rendered through a portal into document.body
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
   - `src/apps/manifests.js`: add the manifest to `PLUGIN_APPS` (registry data).
   - `src/apps/components.js`: map `id → component` in `APP_COMPONENTS`.

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