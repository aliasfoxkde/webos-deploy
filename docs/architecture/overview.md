# Architecture Overview

ArtCraft WebOS is a browser desktop: a window manager, taskbar, start menu,
store, and settings — all of which know nothing about individual apps. Apps
are **plugins**: self-contained directories with a data manifest, their own
UI, and optionally scoped CSS. The shell renders whatever
`webos/src/os/registry.js` hands it.

Authoritative deep dive: [planning/webos-apps/ARCHITECTURE.md](../planning/webos-apps/ARCHITECTURE.md)
— its `## Module index` is machine-enforced against `webos/src/` by
`webos/tests/docs-coverage.test.js` (a doc that misses a file fails CI).

The 13 bundled first-party plugins are separate from the 13 external
Craft app registrations described in
[the app guide](../getting-started/apps.md).

## Layers

```
webos/src/
├── main.jsx / App.jsx    entry + desktop root (windows, icons, deep links)
├── os/                   OS core, no UI: registry, state/persistence, themes,
│                         IndexedDB virtual disk, snapping, wallpapers, bridge
├── shell/                window system UI: Window, Taskbar, StartMenu, Store,
│                         Settings, ContextMenu, Sidebar, Screensaver, ErrorBoundary
└── apps/                 bundled plugins: browser, calculator, chat, editor,
                          files, notepad, photos, taskmgr, terminal, video, weather, snippet, cast
```

## Key contracts

- **Plugin manifests** — every app is data; adding an app is a copy-paste
  pattern, never shell surgery.
- **Crash containment** — `shell/ErrorBoundary.jsx` renders a per-window
  recovery card; a render throw never blanks the desktop.
- **Theme + AAA contrast** — theme presets carry tokens enforced by
  `tests/contrast-audit.test.js` (WCAG 2.1 AAA, including wallpaper-extreme
  flattening).
- **Persistence** — `os/state.jsx` reducer with `webos.*` keys;
  `os/db.js` IndexedDB virtual disk (`fileGet/filePut/fileList`).
- **Dev bridge** — `os/bridge.js` accepts evalAsync envelopes and
  screenshots for automation; see [Bridge](bridge.md).

## Docs-references gate

Any backticked repo path cited in `README.md`, `CLAUDE.md`, or
`docs/**/*.md` must exist — enforced by `webos/tests/docs-references.test.js`.
