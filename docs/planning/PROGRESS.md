# Progress — ArtCraft WebOS

Live status board. Update this (and [SESSIONS.md](SESSIONS.md)) at the end
of every working session. Plan-of-record for open work:
[HANDOFF.md](HANDOFF.md).

## Snapshot (verified 2026-10-18)

| Dimension | State |
|---|---|
| Released / deployed version | **3.15.0** → next: **3.16.0** ([v3.15.0](https://github.com/aliasfoxkde/webos-deploy/releases/tag/v3.15.0)) |
| Production | https://artcraft-webos.pages.dev — served bundle hash matches local `webos/dist`, `sw.js` cache `webos-v3.15.0` |
| FireCraft | https://firecraft-web.pages.dev — default app; H2.0 verify-or-redeploy pending (upstream v0.2.0 vs deployed bundle pre-v0.2.0) (local + production) |
| Tests | 1019 specs / 69 files, `npm run ci` green |
| Coverage | 96.76% stmts / 88.78% branches / 96.02% funcs / **99.92% lines**; floors 96.5/88.5/95.8/99.8 in `webos/vitest.config.js` |
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
- [ ] **H2** FireCraft: FIRST verify-or-redeploy (H2.0 — upstream at v0.2.0 with bridge fixes, deployed bundle predates it)
      v0.2.0 with bridge fixes; the deployed bundle predates it), then
      deeper integration (bridge autosave to the Files disk, open-with,
      export-to-Photos) — the bridge contract is unused beyond liveness.
- [ ] **H3** Upstream adoption watch — FireCraft app mark swap when
      upstream ships one; fetch-apps.sh entries if upstream release zips
      appear (incl. deck/sound/effect).
- [ ] **H4** Quality forward path — branch coverage stretch (88.78%),
      dependency refresh, Aegis re-scan cadence.
- [ ] **H5** GitForge registration (operator) + revalidation procedure.
- [ ] **H6** Next release: **3.16.0** — full checklist in HANDOFF.md.

## Deliberately closed (do not reopen without new evidence)

- The 4 uncovered lines (3 unreachable default arms + Panels.jsx:336 V8
  attribution quirk) — proven unreachable/mis-attributed; documented in
  QUALITY-PROGRAM.md. Ratchets only ever go up.
- Istanbul conditional-JSX attribution — covering those lines requires
  invoking the arrow functions (click the buttons), not refactoring JSX.
- Cloudflare compute on the rendering path — verified absent; keep it that
  way (static Pages + thin proxy worker only).
