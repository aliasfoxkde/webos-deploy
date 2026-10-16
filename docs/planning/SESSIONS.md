# Session log — ArtCraft WebOS

Per-session work log, newest last. One entry per working session: scope,
what changed, evidence. Facts only — plans and status live in
[HANDOFF.md](HANDOFF.md) / [PROGRESS.md](PROGRESS.md), narrative history in
[HISTORY.md](HISTORY.md).

## 2026-10-10 — quality program opens; Aegis triage phase 2

- Deep audit of the repo (coverage gaps, docs drift, lint strictness, CI,
  WCAG, code smells) and drafting of the phased quality plan.
- First Aegis pattern-scan triage recorded in
  [QUALITY-PROGRAM.md](QUALITY-PROGRAM.md) ("phase 2" section).
- Baseline releases v3.5.0–v3.6.0 tagged (FX wallpapers, Liquid Glass).

## 2026-10-11 — feature train v3.7.0 → v3.13.0

- Seven releases in one day, each shipped through the full gate:
  Browser rewrite (3.7.0), app fixes (3.7.1), store wave 4 + singleton
  shell apps (3.8.0), taskbar/start alignment (3.9.0), ErrorBoundary crash
  containment (3.10.0), WebGL2 water wallpaper + FX controls (3.11.0),
  SoundCraft + EffectCraft as default apps (3.12.0), theme builder +
  wallpaper compositor (3.13.0).
- Companion FireCraft development proceeded in its own repo
  (`/nas/Temp/repos/FireCraft`) — milestones toward M12, separate history.

## 2026-10-12 — quality program executed (tasks #98–#105), v3.14.0

Phases of [QUALITY-PROGRAM.md](QUALITY-PROGRAM.md), all committed and pushed:

- **Audit + plan** (#98, #99): findings → `QUALITY-PROGRAM.md`.
- **Lint hardening** (#100): strictest ruleset, zero warnings
  (`d961caf`, plus pre-existing fixes from `20a3c84`).
- **WCAG AAA** (#101): full token enumeration; every preset's text/dim/
  danger/accent-ink/focus gated ≥7:1 paper and ≥4.5:1 chrome over four
  wallpaper extremes; two real fixes — ocean `dim` token, desktop labels
  moved onto scrim pills (`6fa53a5`).
- **Coverage** (#102, phases C/E): 1017 specs / 68 files; 99.92% lines,
  floors ratcheted to 96.5/88.5/95.8/99.8; the 4 uncovered lines are
  documented unreachable arms + one proven V8 attribution quirk — settled,
  do not chase. Coverage-timeout flake class eliminated (`testTimeout`
  20 s, fps assertion honestly relaxed).
- **Cleanup + full-tree Aegis** (#103): src (110 files) + tests (68) scans;
  every high/medium finding triaged by hand — zero real defects; triage
  table recorded in QUALITY-PROGRAM.md (`b8afdff`).
- **CI validation** (#104): GitHub Actions green on every push; the exact
  `.gitforce.yml` job validated step-by-step in a clean
  `node:24-trixie-slim` container (`361be62`). Registration with a deployed
  GitForge remains an operator action.
- **Docs coverage** (phase F): ARCHITECTURE.md `## Module index` — one row
  per src/ file (110) — pinned two-way by `tests/docs-coverage.test.js`
  (`2a700c6`).
- **Release** (#105, phase G): 3.14.0 bumped ×3, e2e sweep 24/24 phases
  PASS / 0 page errors on the release build, Actions green, `gh release
  create v3.14.0`, wrangler deploy, production verified (`be1137c`).
- Session note discovered the hard way: running `npm ci` in a Docker
  container on this NAS-mounted repo recreates `node_modules/`, `coverage/`,
  `dist/` as root — fix with
  `sudo chown -R mkinney:mkinney webos/{node_modules,coverage,dist}`.

## 2026-10-13 — FireCraft joins the desktop (tasks #106–#110), v3.15.0

- Rebuilt FireCraft's web bundle from its HEAD (`60e11b8`) with its own
  dist gate (wasm 10.9 MB under the 14 MB ceiling, `MANIFEST.sha256`
  verified byte-identical to the prior build, bridge smoke green).
- Created the `firecraft-web` Pages project (wrangler no longer
  auto-creates projects non-interactively — `pages project create` first)
  and deployed; verified `application/wasm` MIME and no frame-blocking
  headers.
- WebOS integration (`05b51f7`): registry row (`firecraft`, default app,
  `embed: true`), original code-drawn mark
  (`packaging/icons-src/firecraft.svg` → 256 px PNG, attribution note),
  Welcome copy corrected to 12 craft apps, CLAUDE.md deploy provenance.
- Verification: `npm run ci` green; embed probe in real Chromium — local
  build and production — desktop icon click → live iframe → bridge
  `{source:'firecraft',type:'ready'}` → full window UI with paint-evidence
  screenshot.
- Release: v3.15.0 (`50ed137`), deployed, production-verified.

## 2026-10-15 — docs audit + handoff finalization (continuation boundary)

- Drift check: this repo unchanged since `30cc6c6` (CI green, production
  `webos-v3.15.0`); sibling craft repos clean on `main` and their versions
  match the CLAUDE.md table. **FireCraft upstream moved to v0.2.0**
  (`4029f1e`, web-bridge fixes) — the deployed `firecraft-web` bundle
  predates it; captured as handoff task H2.0 rather than redeploying
  unasked at the session boundary.
- All-repo docs audit via a new gate, `tests/docs-references.test.js`:
  every repo path cited in README/CLAUDE.md/docs/** must exist (craft-
  repo-relative refs resolve against sibling checkouts; heavy trees are
  indexed one level). First run flagged 18+ stale references — all fixed:
  wrong app paths (apps/… → src/apps/…), a removed terminal test name, an
  ATTRIBUTION.md cited under public/ instead of docs/, a HOSTING.md that
  never existed (README/HISTORY hold that content now), FireCraft doc
  paths made absolute, README's "600+ tests" refreshed, and superseded
  plans bannered (PROGRAM-3 → complete, QUALITY-PLAN → QUALITY-PROGRAM).
  (The old wrong paths are deliberately NOT backticked here — this gate
  fails on any backticked path that does not exist, including in this
  very log.)
- HANDOFF.md finalized as the sole continuation context: cold-start
  checklist, docs-gate ground rule, H2.0 verify-or-redeploy task.
- The first remote CI run on the gate failed: 12 refs resolve only inside
  sibling repos or gitignored trees, which CI's single-repo checkout does
  not have. The gate is now environment-aware (verified against a
  git-archive sim of the CI tree): root paths and webos/ refs must exist
  everywhere; sibling/gitignored refs are verified wherever those
  checkouts exist and skipped where they don't. Negative control: a dead
  webos-scoped ref still fails.

## 2026-10-13 — documentation + handoff + cleanup

- This document set: HANDOFF / SESSIONS / PROGRESS / HISTORY under
  `docs/planning/`; ARCHITECTURE.md gains the "FireCraft joins the
  desktop" section (DeckCraft-precedent format).
- E2E tooling relocated into the repo (`packaging/e2e/`) with env
  parameterization — scratch copies in `/var/tmp` would age out.
- Scratch cleanup: workstream logs, release-note drafts, probe copies and
  screenshots removed from `/var/tmp` (manifest-first, enumerated paths);
  artifacts from other workstreams (FireCraft dev, GitForge dev, Aegis
  dev) deliberately left untouched.
