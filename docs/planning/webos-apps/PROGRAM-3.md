# WebOS 3.0 Program — Personas, Real Terminal, AI, Assets

Status: in progress · owner: webos-deploy · created 2026-10-09

Research-informed plan for the 3.0 wave. Sources at bottom; every third-party
asset must land with a license row in `webos/public/ATTRIBUTION.md`.

## 1. OS personas (layout/style/type)

One `persona` state key drives skin + layout via `body[data-persona]` + CSS
custom properties — no per-persona component forks.

| Persona | Reference | Shell translation |
|---|---|---|
| `win` | Windows 11 Fluent (2025 refresh) | centered taskbar + centered Start grid (pinned + All apps), acrylic blur, 8px window radii, Mica-ish tinted chrome, snap hints |
| `mac` | macOS Sonoma/Sequoia HIG | global menu bar top, dock bottom with magnify-on-hover, traffic-light buttons LEFT (red/yellow/green), vibrancy translucency, tighter radii, ⌘-style menu labels |
| `linux` | GNOME 45+ / Adwaita | top bar (activities pill, clock center, tray right), dash below-start overview, libadwaita radii, headerbar-style window chrome |
| `bsd` | tiling-WM culture (Hyprland/i3) | thin top status bar, window borders + gaps instead of shadows, tiled feel (stacked layout assist), monospace accents |
| `android` | Material 3 expressive | bottom nav gesture bar, FAB, dynamic-color accents, large radii, quick-settings style tray |
| `tui` | modern TUI (terminal aesthetics) | monospace grid, ASCII box-drawn panels, no blur/shadows, keyboard-first, block cursor styling |

Persona = { chrome vars (radius, blur, chrome alpha, font stack), taskbar
geometry, window-button placement/order, start-menu variant, wallpaper default,
accent default }. Deep per-OS features (real dock magnification physics,
GNOME workspaces) are out of scope for 3.0; visual + behavioral essence only.

## 2. Welcome screen

First-run overlay (guarded by `webos.welcomed`): WebOS brand + version, short
capability list, **persona picker** (6 cards, live previews), documentation
links (repo README, getartcraft.com/apps), Enter button. Reopenable from
Settings → About. Renders before first paint of desktop; skips on `?open=`
deep links (app-first UX).

## 3. Real assets — no more CSS-only

- **Craft app icons: the real ones.** Every sibling repo ships
  `assets/app-icon/<app>-1024.png` (original art by the project owner,
  MIT OR Apache-2.0). Copy into `webos/public/icons/craft/<app>.png`
  (256px re-encode where the source allows) and point the registry at them.
  Retire the hand-drawn stand-ins for the 8 craft apps.
- **UI glyphs: Lucide.** The craft family already standardizes on Lucide
  (ISC, verified in photocraft/ATTRIBUTION.md). WebOS tray/menu glyphs move
  to Lucide paths (vendored subset, no runtime dep) for family consistency.
- **Wallpaper photos: bundled, PD/CC0.** ~8 public-domain photographs
  (US NPS / NASA sources) downloaded from Wikimedia Commons, recompressed to
  ≤1920w JPEG, bundled under `public/wallpapers/photos/` with a license row
  each in ATTRIBUTION.md. Bundled (not hotlinked) so the OS stays offline-
  capable and third-party-tracker-free.
- **Interactive wallpapers: canvas FX.** `fx:` wallpaper kind rendered by a
  canvas layer (rAF, pauses on hidden tab, honors prefers-reduced-motion):
  `fx:aurora`, `fx:starfield` (pointer parallax), `fx:waves`, `fx:mesh`,
  `fx:matrix` (TUI persona companion). Interactive = pointer/touch input
  perturbs the animation.

## 4. Start menu / taskbar overhaul

Search-first Start: text box (apps + settings sections + "Ask AI" row),
pinned grid (drag-reorder later), All apps grouped by category, recent row,
footer power menu (Restart = reload, Shut down = overlay), user chip.
Persona-styled: `win` centered panel, `mac` panel-over-dock, `linux`
overview-ish, `tui` full-width ASCII column. Taskbar: icon-size setting,
tray item toggles, start alignment (left/center), pinned management.

## 5. Granular settings

Persona picker + per-persona defaults; UI: scale (html font-size 85–125%),
animations on/off, transparency strength, corner radius, font scale;
taskbar: position, alignment, icon size, labels, tray toggles, clock;
desktop: icon size, grid spacing, sort; windows: focus behavior; wallpaper
(presets / photos / FX / custom); sound; network; apps; storage; about +
welcome reopen. Every control persists under `webos.*` (no session-only toggles).

## 6. AI chat (integration-ready shell)

`apps/chat/` plugin + sidebar widget + Start "Ask AI": message list, persisted
history (`webos.chat.*`), streaming-ready adapter interface
(`adapters/` local echo → future provider). Honest state: "No model configured
yet — the adapter API is wired for a later integration." No fake answers.

## 7. Terminal (real, in-browser)

Frontend: **xterm.js** (MIT; the universal browser terminal component — used
as the frontend by v86/WebVM/container2wasm alike) behind a lazy chunk.
Backends, staged:
1. **webos shell (3.0)**: real command language over the OS —
   `help apps launch close windows settings get/set wallpaper volume theme
   persona open echo clear date os.status` + tab completion + history
   (↑/↓), Ctrl+C/L. Every command mutates real OS state.
2. **Linux mode (3.1, tracked)**: v86 (BSD-2-Clause emulator) booting a
   Buildroot/BusyBox image fetched lazily from a CDN at the user's request
   (keeps repo + CSR purity; no server). container2wasm (CNCF sandbox) is the
   alternative if v86 integration disappoints.
3. **craft MCP bridge (3.1, tracked)**: native craft apps speak JSON-lines on
   127.0.0.1:79xx; the WEB builds' surface is being audited
   (`vectorcraft/apps/vectorcraft-web/src/main.rs` is the first candidate).
   Terminal gets `craft <app> <command>` once the web control channel is
   confirmed; design keeps an MCP-shaped envelope so an external AI client
   can drive the same commands.

## 8. App Store expansion (real PWAs)

Verified-embeddability candidates (curl X-Frame-Options/CSP before adding):
2048 (play2048.co), Hextris (hextris.github.io), Excalidraw, tldraw,
Squoosh, Photopea (tab-only if it blocks framing). Non-embeddable → honest
tab-launch rows. Icons drawn in-family or from bundled Lucide-derived art —
never scraped brand marks. Research seeds: PWA Directory, awesome-pwa.

## Research sources

- Fluent 2 Design System — fluent2.microsoft.design (Acrylic/Mica materials)
- Microsoft Design, "Start, fresh" (2025 Start redesign) — microsoft.design
- Apple HIG (traffic lights, menu bar, dock) — developer.apple.com/design
- GNOME 45 / Adwaita, KDE Plasma 6 visual language — release notes
- Material 3 expressive — m3.material.io
- xterm.js — xtermjs.dev; v86 — github.com/copy/v86 (copy.sh demos);
  WebVM 2.0 — labs.leaningtech.com; container2wasm — CNCF Sandbox 2025-01
- PWA Directory (Excalidraw, tldraw offline listings); awesome-pwa (hemanth)
- Lucide icons (ISC) — lucide.dev; photocraft/ATTRIBUTION.md (family precedent)
- Craft app icons: `<repo>/assets/app-icon/` (MIT OR Apache-2.0, original art)

## Sequencing (this program)

Assets → personas + welcome → start/taskbar/settings → terminal + AI chat →
store expansion → verify (CDP driver) → docs + deploy. Anything unfinished
stays an open task, never a silent gap.
