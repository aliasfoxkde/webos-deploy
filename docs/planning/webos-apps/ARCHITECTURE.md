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
(iconSize, sort) · `groups` (desktop icon groups: `{ id: 'grp-…', name,
appIds }` — grouped icons leave the grid and live inside their folder tile;
`desktop.order` stores group ids too, uninstalling an app unfiles it) ·
`taskbar` (position bottom|top, autohide, labels, clock24,
showDate, pinned app ids — drag icons onto the bar to pin, drag within the bar
to reorder) · `widgets`
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
to 256 px into `webos/public/icons/craft/<app>.png` and the eight registry
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
