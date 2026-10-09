# ArtCraft WebOS

A browser desktop ("WebOS") for the 8 ArtCraft craft apps, plus bundled
first-party apps, an App Store of curated external web apps, and a
customizable widget sidebar. Everything is **100% client-side rendered** —
the shell is a Vite + React SPA, app builds are static WASM sites, and no
Cloudflare Workers compute runs on the main path.

The craft app builds are **never committed to this repo** — they are synced
from upstream GitHub releases (`storytold/<app>`, asset
`{app}-web-<version>.zip`) by `packaging/fetch-apps.sh`.

## Layout

```
webos/          the OS shell (Vite + React) → deploys to artcraft-webos.pages.dev
apps/           fetched upstream builds, one dir per app   [gitignored]
zips/           release zip cache                          [gitignored]
r2-blobs/       >25 MiB wasm blobs, uploaded to R2         [gitignored]
packaging/      fetch-apps.sh, pwa-inject.sh, icons-*.sh, HOSTING.md
docs/           architecture + planning notes
cadcraft/ … zed/   sibling independent source repos (NOT part of this repo)
```

## Live URLs

| Project | URL |
|---|---|
| artcraft-webos (the desktop) | https://artcraft-webos.pages.dev/ |
| craft apps | `https://<app>-web.pages.dev/` (vectorcraft: `vectorcraft-web-9y7`) |
| Browser in Browser (Firefox WASM) | https://browserinbrowser.pages.dev/ |

## Quickstart

```bash
# 1. fetch the craft app builds from upstream releases
packaging/fetch-apps.sh                 # or --app photocraft, --force to refetch

# 2. work on the shell
cd webos && npm install
npm run dev                             # vite dev server
npm run build                           # → webos/dist/

# 3. deploy (craft apps deploy from apps/<name>/, see packaging/HOSTING.md)
cd webos && npx wrangler pages deploy dist --project-name artcraft-webos --branch main
```

Oversized blobs (designcraft, pdfcraft, vectorcraft, wordcraft, browserinbrowser)
are served from the R2 bucket `craftweb` through a per-app `_worker.js` — the
only place Workers compute is involved, and only as a pass-through. See
`packaging/HOSTING.md`.

## Rules that hold across this project

- **Clean-room** — the parity apps are observed black-box only; every
  icon/image/font is original artwork, CC0, or properly licensed.
- **Rust/WASM apps** (the craft apps) build to the browser via trunk; this
  repo only packages and hosts their release output.
- **No builds in git** — `apps/`, `zips/`, `r2-blobs/` are reproducible from
  upstream releases; keep them out of history.
