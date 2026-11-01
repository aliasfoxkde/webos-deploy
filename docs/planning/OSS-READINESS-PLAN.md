# Open-source readiness plan — post-v3.23.0 (written 2026-11-01)

Derived from a full audit on 2026-11-01: gates green (`npm run ci`), e2e
sweep 31/31, coverage at 98.89/94.91/99.05/99.92 vs floors
98.6/94.6/98.8/99.85, token-level WCAG AAA auditor passing, Aegis +
shellcheck + docs gates wired in both CI systems, community files and
layered docs landed (368861f). This plan covers what the audit found
still open, benchmarked against well-regarded OSS web repos.

## Baseline (already done — do not redo)

- README hero + screenshot, `.github/` community files (CONTRIBUTING,
  CODE_OF_CONDUCT, SUPPORT, issue/PR templates), layered `docs/` tree
  with AGENTS.md, wiki pushed (13 pages).
- CI: lint zero-warnings, Aegis pinned scanner, shellcheck, docs gates,
  WCAG contrast auditor, coverage ratchets, build, e2e sweep — mirrored
  in `.github/workflows/ci.yml` and `.gitforce.yml`. Dependabot on.
- Deliberately closed items live in PROGRESS.md ("Deliberately closed")
  — do not reopen without new evidence.

## P14 — e2e hardening (small, do first)

- [x] P14.1 Fix the cold-start flake: `boot-welcome` asserted `.wl-enter`
  one-shot after polling `#start-btn`; a slow React mount failed the whole
  run (observed 2 of 3 local runs on 2026-11-01). Fixed with a 15s poll;
  verified PASS ×2. Regression class: every sweep assertion that follows a
  poll must itself poll or be reached only after a settle.
- [x] P14.2 Sweep the sweep for other one-shot assertions after wait()
  (grep `await wait(` then a bare `evalJs` assert) and convert to `poll`.
  Done via an `assertPoll` helper (PR #23); all DOM/async asserts now poll,
  including the mobile, tiling, and groups phases. Verified: sweep 31/31,
  0 page errors, after the rollout.
- [x] P14.3 Add a `npm run sweep` script in `webos/package.json` that
  builds then invokes the sweep (PR #23).

## P15 — CI/CD adoption (benchmark-informed)

- [ ] P15.1 GitHub Actions additions (SHA-pinned like the existing steps):
  - `actions/dependency-review` on PRs touching `webos/package*.json`
    (free, catches supply-chain drift Dependabot can't).
  - A release workflow: on tag `v*`, build + `wrangler pages deploy` +
    create the GitHub release with the notes from HISTORY.md. Deploy
    today is manual; tags exist only as bookkeeping.
- [ ] P15.2 Branch protection on `main` (repo settings, one-time):
  require the CI check, enable auto-merge and
  delete-head-branches-on-merge. Solo-maintainer friendly: auto-merge
  still requires the green check.
- [ ] P15.3 Release notes automation: adopt **release-please** (fits the
  existing Conventional-Commits history; changesets would add a second
  bookkeeping file). Low priority — the manual HISTORY.md flow works.
- Overkill for a solo repo, deliberately not adopted: CodeQL (no
  first-party compiled/typed surface; Aegis covers pattern scanning),
  coverage-upload services (ratchet floors already gate), stale bot
  (issue volume doesn't justify it), versioned docs site (docs gate +
  wiki cover it).

## P16 — quality floor nudges (ratchets only go up)

- [ ] P16.1 Branch coverage 94.91% with headroom ≈0.3% over the floor —
  the thinnest margin of the four. Before the next feature PR, raise the
  floor to the measured value minus the standard tolerance (repeat the
  H7 protocol: two consecutive full runs agree, then pin).
- [ ] P16.2 Strictest-lint pass: trial `eslint-plugin-react`'s
  `react/jsx-key`, `react/no-array-index-key` and
  `react-hooks/exhaustive-deps` at `error` (already recommended-level —
  verify, don't assume). Add `no-eval`, `no-extend-native` to the strict
  set if not implied by `js.configs.recommended`. Any rule that needs a
  blanket disable stays off.
- [ ] P16.3 Accessibility beyond contrast: the auditor covers 1.4.6/1.4.3/
  1.4.11 at the token level. Sweep for the behavioral AAA/AA items the
  token gate can't see — focus trap in modals (Welcome, SaveDialog),
  `aria-live` for toasts, visible-focus retention in the Terminal canvas —
  as one audit session with fixes + component tests.

## P17 — GitForge local validation (operator-assisted)

- [ ] P17.1 `gitforge auth --login <user>` requires the interactive
  password; agent sessions cannot complete it. Once authenticated, run
  `gitforge pipeline -r webos-deploy-ci` on this branch and confirm the
  mirror passes identically to GitHub CI (H5.2's remaining step).
- [ ] P17.2 If the runner host lacks egress, confirm the sweep's
  FireCraft phases SKIP (they are skip-by-design) and the verdict stays PASS.

## P18 — release & deploy (the routine loop)

- [ ] P18.1 Bump `webos/package.json` version (v3.23.0 → v3.24.0: docs +
  e2e fix, no app-behavior change).
- [ ] P18.2 Update PROGRESS.md (tick P14.1, note the plan), append
  SESSIONS.md, HISTORY.md entry.
- [ ] P18.3 Green gate → commit → push → merge to `main` → tag `v3.24.0`
  → GitHub release (P15.1's workflow automates this once it exists) →
  `wrangler pages deploy webos/dist --project-name artcraft-webos`.
- [ ] P18.4 Post-deploy verification: `curl -s
  https://artcraft-webos.pages.dev/sw.js` shows the new cache stamp;
  production smoke via the sweep against the deployed URL is NOT possible
  (sweep serves local dist) — verify index.html hash instead.

## Standing watches (unchanged)

- H3 upstream adoption watch (twelve apps; registry pinned by
  `tests/registry-versions.test.js`).
- FireCraft app-mark swap blocked on aliasfoxkde/FireCraft#2 (R1).
