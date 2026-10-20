# Progress — ArtCraft WebOS

Live status board. Update this (and [SESSIONS.md](SESSIONS.md)) at the end
of every working session. Plan-of-record for open work:
[HANDOFF.md](HANDOFF.md).

## Snapshot (verified 2026-10-20)

| Dimension | State |
|---|---|
| Released / deployed version | **3.19.0** → next: **3.20.0** ([v3.19.0](https://github.com/aliasfoxkde/webos-deploy/releases/tag/v3.19.0)) |
| Production | https://artcraft-webos.pages.dev — served bundle hash matches local `webos/dist`, `sw.js` cache `webos-v3.19.0` |
| FireCraft | https://firecraft-web.pages.dev — v0.2.1 integrated, bridge autosave/open-with/exportPng→Photos; save-as dialog for export-to-Files (2026-10-19) |
| Tests | 1058 specs / 75 files, `npm run ci` green |
| Coverage | 96.79% stmts / 88.83% branches / 96.22% funcs / **99.92% lines**; floors 96.7/88.75/96.05/99.85 in `webos/vitest.config.js` (measured − tolerance) |
| Lint | strictest ruleset, zero warnings |
| Accessibility | WCAG 2.1 AAA token gates incl. wallpaper-extreme flattening + desktop scrim pills |
| Docs coverage | ARCHITECTURE.md Module index (110 rows) ⇄ src/ enforced by `tests/docs-coverage.test.js` — now in GitForge CI pipeline |
| CI | GitHub Actions **green** on `main` (verified 2026-10-20, run 39492352315 — lint, docs gate, WCAG audit, coverage ratchet, build and the 27-phase e2e sweep all pass). GitForge pipeline mirrors the same gates. It had been red on every push from 2026-10-19 — see risk R2 |
| Aegis | baseline regenerated 2026-10-19 (1810 findings / 111 files / 62 pattern classes; new classes: pii-output-marker, finance-tofixed-currency, mobile-optimization, role-play-override, chart-accessibility) |

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
      upstream ships one (waiting on aliasfoxkde/FireCraft#2); H3.2
      fetch-apps.sh entry done (firecraft 0.2.1 from aliasfoxkde org,
      pwa-inject + icons done); watching deck/sound/effect for upstream zips.
- [x] **H4** Quality forward path — H4.1 coverage floors met (96.5/88.5/95.8/99.6), H4.2 deps refreshed (vitest 5.0.5, coverage-v8, fake-indexeddb; React 19 / Vite 8 / ESLint 10 deferred), H4.3 Aegis re-scan zero new findings (baseline suppresses all), H4.4 sweep synced.
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
- [x] **H6** Releases — v3.18.0 shipped 2026-10-19 (its gate was red; fixed in v3.19.0), v3.19.0 shipped 2026-10-20 with a green gate. Checklist in HANDOFF.md.

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
