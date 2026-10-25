# Progress — ArtCraft WebOS

Live status board. Update this (and [SESSIONS.md](SESSIONS.md)) at the end
of every working session. Plan-of-record for open work:
[HANDOFF.md](HANDOFF.md).

## Snapshot (verified 2026-10-25)

| Dimension | State |
|---|---|
| Released / deployed version | **3.23.0** ([v3.23.0](https://github.com/aliasfoxkde/webos-deploy/releases/tag/v3.23.0)) → next: TBD |
| Production | https://artcraft-webos.pages.dev — served bundle hash matches local `webos/dist`, `sw.js` cache `webos-v3.23.0` |
| Craft apps | all twelve on their current upstream web release (2026-10-25): cadcraft 0.13.0, deckcraft 0.11.1, designcraft 0.13.0, effectcraft 0.17.0, firecraft 0.2.3, gridcraft 0.12.1, lightcraft 0.14.0, pdfcraft 0.14.0, photocraft 0.16.0, soundcraft 0.13.1, vectorcraft 0.17.0, wordcraft 0.11.0 — eight of them served from the R2 `craftweb` route |
| FireCraft | https://firecraft-web.pages.dev — **v0.2.3**, served from the upstream release zip (wasm `firecraft-web-d13f1a83e8a1a76f`) on the standard `fetch-apps.sh` pipeline; bridge autosave/open-with/exportPng→Photos + export-to-Files (2026-10-21) |
| Tests | ~1416 specs / 91 files, `npm run ci` green |
| Coverage | 98.91% stmts / 94.91% branches / 99.16% funcs / **99.92% lines**; floors 98.6/94.6/98.8/99.85 in `webos/vitest.config.js` (91 files, measured − tolerance) |
| Lint | strictest ruleset, zero warnings |
| Accessibility | WCAG 2.1 AAA token gates incl. wallpaper-extreme flattening + desktop scrim pills |
| Docs coverage | ARCHITECTURE.md Module index ⇄ src/ enforced by `tests/docs-coverage.test.js` — now in GitForge CI pipeline |
| Registry versions | 12/12 craft-app rows match the deployed bundle (verified by asset + wasm hash); pinned by `tests/registry-versions.test.js` |
| CI | GitHub Actions: lint, docs gate, WCAG audit, coverage ratchet, build, 27-phase e2e sweep, **shellcheck**, **Aegis scan**. GitForge pipeline mirrors the same gates. It had been red on every push from 2026-10-19 — see risk R2. The Aegis step added 2026-10-20 was itself broken (never scanned) and was repaired 2026-10-21 — see R3 |
| Aegis | scanner pinned to `aliasfoxkde/aegis` **v0.6.4** (checksum-verified) via `packaging/aegis-scan.sh`; baseline regenerated with that binary (1809 findings / 111 files / 22 categories); the gate fails only on findings outside the baseline |

## Done (evidence in HISTORY.md / SESSIONS.md)

- [x] Quality program phases A–G (audit → plan → lint → AAA → coverage →
      cleanup/triage → docs gate → release) — complete at v3.14.0.
- [x] FireCraft deployed + integrated as twelfth craft app — complete at
      v3.15.0.
- [x] E2E tooling committed to `packaging/e2e/`.
- [x] Docs-reference gate (`tests/docs-references.test.js`) + full-docs
      staleness pass — 18+ stale references fixed, superseded plans
      (PROGRAM-3, QUALITY-PLAN) bannered (2026-10-15).

## Open (ordered; atomic tasks in HANDOFF.md)

- [ ] **H1** Routine-change loop — standing procedure, apply per change.
- [x] **H2** FireCraft: H2.0–H2.6 complete — v0.2.1 deployed, v3.17.0 shipped.
      H2.1 contract documented; H2.2 postToApp correlate implemented; H2.3
      autosave (applied→exportDocument→filePut, ready→fileGet→openDocument);
      H2.4 open-with via Files context menu; H2.5 exportPng→Photos and
      export-to-Files (shared SaveDialog component, 2026-10-19); H2.6 E2E probe
      open→apply→exportDocument round-trip verified.
- [ ] **H3** Upstream adoption watch — H3.1 FireCraft app mark swap when
      upstream ships one (waiting on aliasfoxkde/FireCraft#2, still open
      2026-10-25). All twelve apps were re-adopted 2026-10-25 (P13, v3.23.0);
      the watch continues for the next upstream release of any of the
      twelve. H3.3 registry audit holds — pinned by
      `tests/registry-versions.test.js`.
- [x] **P9** Future-work items — P9.1 and P9.5 closed with the craft-app
      upgrade (2026-10-22); P9.2 preview server pinned to 127.0.0.1;
      P9.3 the sweep asserts internal state (window registry + IndexedDB);
      P9.4 the legacy driver deprecated, its surfaces ported into the sweep.
- [x] **P10** Adopt the upstream craft-app releases — complete 2026-10-22:
      all twelve craft apps upgraded to their current upstream web release
      (cadcraft 0.3.0→0.10.0 … vectorcraft 0.7.0→0.14.0, deck/sound/effect
      joined the standard release-zip pipeline), seven oversized wasm
      bundles moved to the R2 route via `packaging/r2-publish.sh`, registry
      rows + SW cache stamps re-pinned, each deployment production-verified
      (asset hash + `application/wasm`), shell released as v3.21.0.
- [x] **H4** Quality forward path — H4.1 coverage floors met (96.5/88.5/95.8/99.6), H4.2 deps refreshed (vitest 5.0.5, coverage-v8, fake-indexeddb; re-refreshed 2026-10-21: sql.js 1.15.1, vite 6.4.5 — React 19 / Vite 8 / ESLint 10 / happy-dom 21 deferred with reasons in SESSIONS.md), H4.3 Aegis re-scan zero new findings (baseline suppresses all), H4.4 sweep synced.
- [x] **H5** H5.3 container revalidation complete in node:24-trixie-slim; H5.1 pipeline registered (push, 4e1079cd…ccc957); H5.2 GitHub Actions as primary gate (runner dispatch pending for GitForge).
- [x] **H7** Coverage determinism + CI repair (2026-10-20) — three one-second
      clock intervals (Taskbar, Sidebar clock widget, Screensaver big clock)
      were covered only when the test file outlived the timer, so the same
      commit measured 95.87% functions on CI and 96.02% locally. The ratchet
      was set from the local number and turned CI red on every push.
      `tests/clock-timers.test.jsx` drives all three timers with fake timers;
      the metric is now reproducible (two consecutive full runs agree exactly)
      and the floors sit a fixed tolerance below the measured value.
      Also in this pass: the dead `makeFirecraftExportHandlers` export was
      removed from `src/shell/Window.jsx` (it duplicated the live
      state-driven handlers and existed only for its own test), the live
      export-to-Files path got component-level tests, and the E2E sweep's
      FireCraft open-with phase was repaired (it imported a module URL the
      production build does not serve) — the sweep is green 27/27.
- [x] **H6** Releases — v3.18.0 shipped 2026-10-19 (its gate was red; fixed in v3.19.0), v3.19.0 shipped 2026-10-20 with a green gate, v3.20.0 shipped 2026-10-21 (FireCraft v0.2.2 sync, coverage sprint, Aegis gate repaired), v3.21.0 shipped 2026-10-22 (all craft apps upgraded to their current upstream releases; R2 publish automated), v3.22.0 shipped 2026-10-24 (reproducible Aegis baseline, Dependabot, e2e shell-state assertions, os/db error-path coverage), v3.22.1 shipped 2026-10-25 (e2e DevTools-port timeout fix), v3.23.0 shipped 2026-10-25 (all twelve craft apps upgraded to current upstream releases — P13). Checklist in HANDOFF.md.

## Deliberately closed (do not reopen without new evidence)

- The 4 uncovered lines — 3 are unreachable reducer/switch `default:` arms
  (calcState.jsx:126, state.jsx:483, MarkdownView.jsx:81) and Panels.jsx:336
  is a V8 attribution quirk; documented in QUALITY-PROGRAM.md. The paths
  that were genuinely reachable (Files.jsx:304 "Open in FireCraft",
  SaveDialog.jsx:50 backdrop cancel, Window.jsx:81-87 export-to-Files) are
  covered as of 2026-10-20. Ratchets only ever go up.
- Istanbul conditional-JSX attribution — covering those lines requires
  invoking the arrow functions (click the buttons), not refactoring JSX.
- Cloudflare compute on the rendering path — verified absent; keep it that
  way (static Pages + thin proxy worker only).

## Risk register

| ID | Description | Impact | Mitigation | Status |
|---|---|---|---|---|
| R1 | H3.1 blocked on FireCraft upstream shipping an official app icon (aliasfoxkde/FireCraft#2) | WebOS uses a code-drawn placeholder for FireCraft; official mark unavailable until upstream ships one | Swap script ready; upstream issue filed with exact requirements | ACCEPTED — placeholder glyph is the permanent design (2026-10-19) |
| R2 | Coverage ratchet was set from a non-reproducible local measurement (2026-10-19) | Every push from 594e579 to 7a6e12c had a red CI; v3.18.0 shipped with a failing gate and the release notes/progress board wrongly claimed CI was green | Root cause found (timer-dependent coverage); `tests/clock-timers.test.jsx` pins the metric; floors now sit a fixed tolerance below a measured value two consecutive runs agree on | RESOLVED 2026-10-20 |
| R3 | The Aegis CI step added 2026-10-20 never scanned anything: nonexistent `setup-python` SHA, wrong tool (the PyPI `aegis-cli` is an unrelated project), nonexistent `--format github`, and a baseline built by a different aegis version (8 categories vs 22) whose fingerprints matched nothing | The security gate was reported as wired but was in fact dead — the repo was unscanned in CI while the progress board claimed a scan ran | `packaging/aegis-scan.sh` pins the real scanner (aliasfoxkde/aegis v0.6.4) with a verified checksum; the baseline was regenerated with that binary; a negative control (injected AWS key) proves the gate fails on new findings | RESOLVED 2026-10-21 |
