# Quickstart

ArtCraft WebOS runs entirely in your browser at
**https://artcraft-webos.pages.dev** — nothing to install. Your desktop
layout, files, and settings persist locally (IndexedDB + localStorage);
there is no account and no server-side storage.

## First minute

1. Open the URL. The desktop appears with app icons and a taskbar.
2. Double-click an icon (single tap on mobile) to launch an app.
3. Open the **Start menu** (bottom taskbar) to browse all apps, including
   the twelve embedded craft apps and the App Store.
4. Right-click the desktop for wallpaper, display, and personalization
   options; right-click any icon or titlebar for its property sheet.

## Everyday keys

| Keys | Action |
|---|---|
| `Meta` + arrows | Snap/tile the focused window |
| Window drag to screen edge | Snap to half/quarter zones |
| Taskbar right-click | Taskbar position/autohide settings |
| `Esc` | Close popups / menus |

## Files & persistence

The **Files** app shows a virtual disk backed by IndexedDB. Downloads,
saved documents (e.g. FireCraft exports), and app data live there. Clearing
site data in your browser erases everything — there is no cloud copy.

## Mobile

The shell detects small screens and switches to a full-screen app drawer.
Widgets and taskbar behave the same; windows maximize by default.

## Privacy

No analytics, no telemetry, no accounts. The one network call the shell
itself makes beyond static assets is the Browser app's optional `/proxy`
reader (see [Browser & proxy](../architecture/browser.md)); it forwards no
cookies and stores nothing.
