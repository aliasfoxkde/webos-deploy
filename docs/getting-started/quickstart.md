# Quickstart

ArtCraft WebOS runs entirely in your browser at
**https://artcraft-webos.pages.dev** — nothing to install. Your desktop
layout, files, and settings persist locally (IndexedDB + localStorage);
there is no account and no server-side storage.

## First minute

1. Open the URL. The desktop appears with app icons and a taskbar.
2. Double-click an icon (single tap on mobile) to launch an app.
3. Open the **Start menu** (bottom taskbar) to browse all apps, including
   the 13 registered external Craft apps and the App Store.
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
saved documents (e.g. FireCraft exports), and app data live there. Settings
and some bundled-app state are stored in the browser profile as well.
Clearing site data or losing the browser profile can remove that work.

**Important:** user-visible, complete backup/restore is not yet available in
this release. Do not treat browser storage as a backed-up system disk or keep
the only copy of important work in this profile. Export important documents
from their apps and retain independent copies until the backup/restore
workflow is implemented and verified.

## Mobile

The shell detects small screens and switches to a full-screen app drawer.
Widgets and taskbar behave the same; windows maximize by default.

## Privacy

No account is required for the local shell. The shell loads static assets and
the apps/sites you launch; external Craft apps, embeds and frame-friendly
pages are fetched by your browser from their own origins,
and the former `/proxy` reader was removed for security — see
[Browser](../architecture/browser.md).
