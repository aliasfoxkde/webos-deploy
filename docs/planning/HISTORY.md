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
| v3.15.0 | 2026-10-13 | FireCraft joins the desktop as the twelfth craft app (default app, own Pages project, original code-drawn mark); Welcome copy → 12 |
| v3.16.0 | 2026-10-18 | FireCraft v0.2.1 integrated; 4 Settings edge-case specs; H3.3 photocraft corrected |
| v3.17.0 | 2026-10-19 | FireCraft H2 complete (bridge/autosave/open-with/exportPng→Photos/E2E probe); H4 quality forward path complete (deps refreshed, Aegis clean, docs synced); H5.3 container revalidation clean; 1037 specs, coverage floors maintained |
| v3.18.0 | 2026-10-19 | fix(bridge): close event-listener-leak in bridgeRequest/postToApp; chore(.gitforce): add docs-coverage gate; chore(aegis): regenerate baseline (1810 findings, 111 files); H3.2 firecraft fetch-apps entry complete; 1052 specs, 99.78% lines |
| v3.19.0 | 2026-10-20 | fix(ci): coverage made reproducible (fake-timer clock specs) and the ratchet repaired — CI had been red on every push since v3.18.0 was cut; dead `makeFirecraftExportHandlers` export removed; export-to-Files, Files "Open in FireCraft" and SaveDialog backdrop covered; e2e sweep repaired (module-URL import, DevTools port, container sandbox, browser detection) and promoted to a hard CI gate; shared husky pre-commit hook committed; 1058 specs, 99.92% lines |
| v3.21.0 | 2026-10-22 | **Every craft app upgraded to its current upstream web release** (cadcraft 0.3.0→0.10.0, designcraft 0.4.0→0.11.0, gridcraft 0.3.0→0.10.0, lightcraft 0.4.0→0.11.0, pdfcraft 0.4.0→0.11.0, photocraft 0.5.0→0.12.0, vectorcraft 0.7.0→0.14.0, wordcraft 0.3.0→0.9.0, deckcraft 0.4.0→0.9.0, soundcraft 0.5.0→0.11.0, effectcraft 0.8.0→0.14.0; firecraft was already current at 0.2.2) — DeckCraft/SoundCraft/EffectCraft now publish upstream release zips and ride the standard pipeline (their source checkouts moved to `/nas/Temp/repos/<name>` so `fetch_one`'s `rm -rf apps/<name>` cannot destroy them); seven wasm bundles of 29–74 MiB exceed the 25 MiB Pages asset cap and moved to the R2 `craftweb` route through the new `packaging/r2-publish.sh`; PWA wiring injected for deck/sound (effectcraft ships its own glue); registry rows, SW cache stamps and `tests/registry-versions.test.js` re-pinned; two load-dependent test flakes fixed (RTL async timeout budget, registry-derived version assertion); e2e sweep 27/27; deployed and production-verified (`webos-v3.21.0`) |
| v3.20.0 | 2026-10-21 | FireCraft v0.2.2 adopted from the upstream release zip (standard fetch pipeline, registry + SW cache stamp moved 0.2.1→0.2.2); registry version audit pinned by a new test (12/12 rows match deployment); coverage sprint to 1344 specs / 88 files (98.59% stmts, 94.20% branches, 98.16% funcs, 99.92% lines); **the Aegis CI gate repaired** — it had never scanned anything (nonexistent setup-python SHA, wrong tool, nonexistent `--format github`, a baseline from a mismatched scanner build); scanner pinned to aliasfoxkde/aegis v0.6.4 with checksum verification and the baseline regenerated with it; shellcheck made green on the remaining packaging scripts and added to GitHub Actions; CI green (run 39629797419), e2e sweep 27/27, deployed and production-verified (`webos-v3.20.0`) |

## Deployment map

Static Pages deployments only — no compute on the rendering path.

| Target | Deploys from | What |
|---|---|---|
| https://artcraft-webos.pages.dev | `webos/dist` via `npx wrangler pages deploy dist --project-name artcraft-webos --branch main` (run from `webos/`) | The OS shell |
| https://firecraft-web.pages.dev | `apps/firecraft` (fetched from the `aliasfoxkde/firecraft` release zip via `packaging/fetch-apps.sh`) → `wrangler pages deploy apps/firecraft --project-name firecraft-web` | FireCraft (twelfth craft app; upstream publishes a web zip since v0.2.2) |
| cadcraft-web, designcraft-web, gridcraft-web, lightcraft-web, pdfcraft-web, photocraft-web, vectorcraft-web-9y7, wordcraft-web, deckcraft-web, soundcraft-web, effectcraft-web (.pages.dev) | upstream release zips via `packaging/fetch-apps.sh` — all twelve craft apps, fetched into `apps/<name>/` and deployed from there; URLs as registered in `webos/src/os/registry.js` | The craft apps |
| R2 bucket `craftweb` + `_worker.js` | `packaging/r2-publish.sh <app>` — moves the wasm into `r2-blobs/`, writes `_worker.js` + `wrangler.toml` (binding `CRAFTWEB`), uploads with `wrangler r2 object put … --remote`; the deploy then runs from the app directory | wasm blobs over the 25 MiB Pages asset cap (deckcraft, designcraft, effectcraft, lightcraft, pdfcraft, vectorcraft, wordcraft) |

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
- **2026-10-21 (v3.20.0)**: GitHub Actions green on the release commit
  (`0b2dbbc`, run 39629797419) — lint, Aegis scan, shellcheck, docs-coverage
  gate, WCAG contrast audit, coverage ratchet (88 files / 1344 specs,
  98.59/94.18/98.16/99.92), build, 27-phase e2e sweep, artifact upload;
  local coverage run green (1344/1344, exit 0); 27-phase headless-Chromium
  sweep of the built bundle — PASS, 0 page errors; Aegis gate proven live
  (negative control: injected AWS key → 4 findings, exit 1); production
  verified (served `assets/index-5l-KssXj.js` equals local dist,
  `sw.js` cache `webos-v3.20.0`).
- E2E tooling (committed, survives scratch GC): `packaging/e2e/webos-sweep.mjs`
  (full-system sweep) and `packaging/e2e/firecraft-embed-probe.mjs`
  (FireCraft bridge probe; `FC_BASE_URL=` for production runs).
