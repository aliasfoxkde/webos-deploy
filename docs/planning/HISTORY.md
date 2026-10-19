# History — ArtCraft WebOS

Chronological record of what shipped, when, where it runs, and where the
evidence lives. Companion documents: [HANDOFF.md](HANDOFF.md) (plan for the
next agent), [SESSIONS.md](SESSIONS.md) (per-session work log),
[PROGRESS.md](PROGRESS.md) (live status board). Deep feature narratives:
[webos-apps/ARCHITECTURE.md](webos-apps/ARCHITECTURE.md) (versioned sections).
Quality-program record: [QUALITY-PROGRAM.md](QUALITY-PROGRAM.md).

## Release history

GitHub releases: https://github.com/aliasfoxkde/webos-deploy/releases
Commits and tags are the primary record; the notes below are one-line
summaries (full notes live on each release page).

| Version | Published | Highlights |
|---|---|---|
| v3.5.0 | 2026-10-10 | (tag; pre-release-train work — FX wallpapers, store wave 3) |
| v3.6.0 | 2026-10-10 | Liquid Glass design language (frost, specular rim, refraction) |
| v3.7.0 | 2026-10-11 | Chromium-style Browser (tabs reducer, URL intelligence) |
| v3.7.1 | 2026-10-11 | Editor, Photos, Task Manager fixes |
| v3.8.0 | 2026-10-11 | App Store fourth wave; store/settings singleton shell apps |
| v3.9.0 | 2026-10-11 | Start menu & taskbar alignment options |
| v3.10.0 | 2026-10-11 | Crash containment (ErrorBoundary) + gentle saver motion |
| v3.11.0 | 2026-10-11 | WebGL2 water wallpaper ported from webbg-demo + FX controls |
| v3.12.0 | 2026-10-11 | SoundCraft + EffectCraft join the desktop |
| v3.13.0 | 2026-10-11 | Theme builder + wallpaper compositor/studio |
| v3.14.0 | 2026-10-12 | WCAG AAA token enumeration + real contrast fixes; 1017-spec suite; coverage floors 96.5/88.5/95.8/99.8 (99.92% lines); docs-coverage gate (Module index ⇄ src/); strict lint; CI hardening; GitForge clean-container validation; full-tree Aegis triage |
| v3.16.0 | 2026-10-18 | FireCraft v0.2.1 integrated; 4 Settings edge-case specs; H3.3 photocraft corrected |
| v3.17.0 | 2026-10-19 | FireCraft H2 complete (bridge/autosave/open-with/exportPng→Photos/E2E probe); H4 quality forward path complete (deps refreshed, Aegis clean, docs synced); H5.3 container revalidation clean; 1037 specs, coverage floors maintained |
| v3.15.0 | 2026-10-13 | FireCraft joins the desktop as the twelfth craft app (default app, own Pages project, original code-drawn mark); Welcome copy → 12 |

## Deployment map

Static Pages deployments only — no compute on the rendering path.

| Target | Deploys from | What |
|---|---|---|
| https://artcraft-webos.pages.dev | `webos/dist` via `npx wrangler pages deploy dist --project-name artcraft-webos --branch main` (run from `webos/`) | The OS shell |
| https://firecraft-web.pages.dev | `/nas/Temp/repos/FireCraft` checkout: `cargo run -p xtask -- dist --web` → `sha256sum -c MANIFEST.sha256` → `wrangler pages deploy dist/web --project-name firecraft-web` | FireCraft (twelfth craft app; no upstream release zips) |
| cadcraft-web, designcraft-web, gridcraft-web, lightcraft-web, pdfcraft-web, photocraft-web, vectorcraft-web-9y7, wordcraft-web, deckcraft-web, soundcraft-web, effectcraft-web (.pages.dev) | upstream release zips via `packaging/fetch-apps.sh` (the first eight); `apps/<name>/` source checkouts (deck/sound/effect — no upstream zips yet) | The other craft apps — URLs as registered in `webos/src/os/registry.js` |
| R2 bucket `craftweb` + `_worker.js` | `packaging/` tooling | wasm blobs over the 25 MiB Pages asset cap |

## Verification history (what was proven, and how)

- **2026-10-12 (v3.14.0)**: full `npm run ci` green; GitHub Actions green on
  the release commit (`be1137c`); the exact `.gitforce.yml` job ran clean in
  a fresh `node:24-trixie-slim` container (five steps, 67 files / 1015
  specs, identical coverage); 24-phase headless-Chromium sweep of the built
  bundle — PASS, 0 page errors; production served asset hash matched local
  dist and `sw.js` cache name `webos-v3.14.0`.
- **2026-10-13 (v3.15.0)**: `npm run ci` green (68 files / 1017 specs);
  Actions green on `50ed137`; FireCraft embed probe green against the local
  build **and** against production (desktop icon click → live iframe →
  bridge `{source:'firecraft',type:'ready'}` → full window UI: menus,
  Pages/Layers/States/Library/History, status bar `ready`); production
  verified (bundle hash match, `webos-v3.15.0`, FireCraft row + icon live).
- **2026-10-19 (v3.17.0)**: `npm run ci` green (72 files / 1037 specs);
  full FireCraft H2/H4 work shipped; container revalidation clean in
  `node:24-trixie-slim`; Actions green on `376b509`; production verified
  (bundle hash `index-DT3Qpkrn.js`, `webos-v3.17.0` cache, FireCraft
  autosave/open-with/exportPng→Photos all wired).
- E2E tooling (committed, survives scratch GC): `packaging/e2e/webos-sweep.mjs`
  (full-system sweep) and `packaging/e2e/firecraft-embed-probe.mjs`
  (FireCraft bridge probe; `FC_BASE_URL=` for production runs).
