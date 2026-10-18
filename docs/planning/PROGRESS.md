# Progress — ArtCraft WebOS

Live status board. Update this (and [SESSIONS.md](SESSIONS.md)) at the end
of every working session. Plan-of-record for open work:
[HANDOFF.md](HANDOFF.md).

## Snapshot (verified 2026-10-18)

| Dimension | State |
|---|---|
| Released / deployed version | **3.16.0** → next: **3.17.0** ([v3.16.0](https://github.com/aliasfoxkde/webos-deploy/releases/tag/v3.16.0)) |
| Production | https://artcraft-webos.pages.dev — served bundle hash matches local `webos/dist`, `sw.js` cache `webos-v3.16.0` |
| FireCraft | https://firecraft-web.pages.dev — v0.2.1 integrated, bridge autosave/open-with/exportPng→Photos (local + production) |
| Tests | 1034 specs / 72 files, `npm run ci` green |
| Coverage | 96.54% stmts / 88.58% branches / 95.98% funcs / **99.65% lines**; floors 96.5/88.5/95.8/99.6 in `webos/vitest.config.js` |
| Lint | strictest ruleset, zero warnings |
| Accessibility | WCAG 2.1 AAA token gates incl. wallpaper-extreme flattening + desktop scrim pills |
| Docs coverage | ARCHITECTURE.md Module index (110 rows) ⇄ src/ enforced by `tests/docs-coverage.test.js` |
| CI | GitHub Actions green on `main`; GitForge job validated in a clean `node:24-trixie-slim` container (registration = operator action) |
| Aegis | full-tree scans triaged — zero real defects (record in QUALITY-PROGRAM.md) |

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
- [x] **H2** FireCraft: H2.0–H2.6 complete — v0.2.1 deployed, v3.16.0 shipped.
      H2.1 contract documented; H2.2 postToApp correlate implemented; H2.3
      autosave (applied→exportDocument→filePut, ready→fileGet→openDocument);
      H2.4 open-with via Files context menu; H2.5 exportPng→Photos
      (export-to-Files deferred — needs shared save dialog); H2.6 E2E probe
      open→apply→exportDocument round-trip verified.
- [ ] **H3** Upstream adoption watch — FireCraft app mark swap when
      upstream ships one; fetch-apps.sh entries if upstream release zips
      appear (incl. deck/sound/effect).
- [x] **H4** Quality forward path — H4.1 coverage floors met (96.5/88.5/95.8/99.6), H4.2 deps refreshed (vitest 5.0.5, coverage-v8, fake-indexeddb; React 19 / Vite 8 / ESLint 10 deferred), H4.3 Aegis re-scan zero new findings (baseline suppresses all), H4.4 sweep synced.
- [ ] **H5** GitForge registration (operator) + revalidation procedure.
- [ ] **H6** Next release: **3.17.0** — full checklist in HANDOFF.md (H3.1/H3.2 watching; H5.1–H5.3 operator).

## Deliberately closed (do not reopen without new evidence)

- The 4 uncovered lines (3 unreachable default arms + Panels.jsx:336 V8
  attribution quirk) — proven unreachable/mis-attributed; documented in
  QUALITY-PROGRAM.md. Ratchets only ever go up.
- Istanbul conditional-JSX attribution — covering those lines requires
  invoking the arrow functions (click the buttons), not refactoring JSX.
- Cloudflare compute on the rendering path — verified absent; keep it that
  way (static Pages + thin proxy worker only).
