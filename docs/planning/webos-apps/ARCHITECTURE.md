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
├── App.jsx                   desktop root: windows, context menus, deep links
├── styles.css                shell chrome only (desktop, windows, taskbar, popups)
├── os/                       OS core — no UI
│   ├── registry.js           app data: external defaults, store apps, plugin manifests
│   └── state.jsx             reducer + persistence (webos.* keys), theme engine
├── shell/                    window-system UI
│   ├── Window.jsx            window chrome; routes plugin UI vs EmbedFrame
│   ├── EmbedFrame.jsx        iframe hosting + honest "open in new tab" panel
│   ├── Taskbar.jsx StartMenu.jsx AppStore.jsx Settings.jsx
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
