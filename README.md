# ArtCraft WebOS

A browser desktop ("WebOS") for the 11 ArtCraft craft apps, plus bundled
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
packaging/      fetch-apps.sh, pwa-inject.sh, icons-*.sh
docs/           architecture + planning notes
cadcraft/ … zed/   sibling independent source repos (NOT part of this repo)
```

## Live URLs

| Project | URL |
|---|---|
| artcraft-webos (the desktop) | https://artcraft-webos.pages.dev/ |
| craft apps | `https://<app>-web.pages.dev/` (vectorcraft: `vectorcraft-web-9y7`) |
| deckcraft | https://deckcraft-web.pages.dev/ (built from the `apps/deckcraft` source checkout — no upstream release zip yet) |
| soundcraft | https://soundcraft-web.pages.dev/ (built from the `apps/soundcraft` source checkout) |
| effectcraft | https://effectcraft-web.pages.dev/ (built from the `apps/effectcraft` source checkout) |
| Browser in Browser (Firefox WASM) | https://browserinbrowser.pages.dev/ |

## Quickstart

```bash
# 1. fetch the craft app builds from upstream releases
packaging/fetch-apps.sh                 # or --app photocraft, --force to refetch

# 2. work on the shell
cd webos && npm install
npm run dev                             # vite dev server
npm run build                           # → webos/dist/

# 3. deploy (craft apps deploy from apps/<name>/; each repo's
#    packaging/web/README.md holds its hosting notes)
cd webos && npx wrangler pages deploy dist --project-name artcraft-webos --branch main
```

Craft app builds deploy as static sites to Cloudflare Pages
(`<app>-web.pages.dev`), which caps static files at 25 MiB. Bundles over the
cap (designcraft ~40 MiB, vectorcraft, pdfcraft, wordcraft, effectcraft
~44.7 MiB) keep only a `_worker.js` in the Pages deploy — any `.wasm` request
streams from the R2 bucket `craftweb` (binding `CRAFTWEB`, key = the bare
filename) and everything else falls through to static assets. Upload the
oversized blob with `wrangler r2 object put craftweb/<file>.wasm --file <f>
--remote`, mirror it in `r2-blobs/`, and note that `--remote` is required
(plain `wrangler r2 object put` writes to a local simulator).

## Quality gates (webos/)

```bash
cd webos
npm run test            # vitest suite (600+ tests, happy-dom + RTL)
npm run coverage        # suite + v8 coverage, enforced ratchet floors
npm run lint            # eslint, --max-warnings 0 in CI
npm run build           # production bundle → dist/
npm run ci              # lint → coverage → build, all three
```

- **Coverage ratchet** — `webos/vitest.config.js` carries floors just under
  the measured baseline; any coverage regression fails `npm run coverage`.
  Raise the floors as tests land, never lower them.
- **WCAG contrast auditor** — `webos/tests/contrast-audit.test.js` enforces
  token-level ratios per theme preset (danger ink ≥7:1 on paper, focused
  window ring ≥3:1, accent ink ≥7:1 on every accent swatch) and fails if app
  CSS hardcodes a preset palette color. Persona/preset text AAA lives in
  `webos/tests/personas-theme.test.js`; shared WCAG math in
  `webos/tests/theme-math.js`.
- **CI** — `.github/workflows/ci.yml` (GitHub, push/PR/manual dispatch) and
  `.gitforce.yml` (local GitForge mirror) both run install → lint → contrast
  audit → coverage → build. Version bumps touch three files:
  `webos/package.json`, `webos/src/version.js`, `webos/public/sw.js` (cache
  key).

## The Browser

WebOS ships a real browser, not a shortcut: `webos/src/apps/browser/` is a
Chromium-style plugin window (tabs, per-tab history, address bar, Ctrl+T/W/L/R)
with a four-mode rendering stack — official embeds (YouTube/Spotify), direct
frames, a same-origin proxy (Cloudflare Pages Function stripping framing
headers server-side), and an honest "can't run in any frame" hand-off for
sites like Discord whose APIs are CORS-locked to their own origin. Details and
limits: `docs/planning/webos-apps/BROWSER.md`.

## Shell design

The WebOS shell (`webos/`) is plain Vite + React — no Rust. Its win/mac
personas implement a four-phase **Liquid Glass** design language (frost
tokens + specular window rims, anchored rise/drop motion, and Chromium-only
edge refraction via an SVG feDisplacementMap behind a `CSS.supports`
probe — other engines keep the base frost). The design is documented in
`docs/planning/webos-apps/LIQUID-GLASS.md` and
`docs/planning/webos-apps/ARCHITECTURE.md`.

## Rules that hold across this project

- **Clean-room** — the parity apps are observed black-box only; every
  icon/image/font is original artwork, CC0, or properly licensed.
- **Rust/WASM apps** (the craft apps) build to the browser via trunk; this
  repo only packages and hosts their release output.
- **No builds in git** — `apps/`, `zips/`, `r2-blobs/` are reproducible from
  upstream releases; keep them out of history.
