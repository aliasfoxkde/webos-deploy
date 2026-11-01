# OSS-Readiness Plan — post-368861f (2026-11-01)

Status of this branch (`codex/artcraft-open-source-readiness`) after the
community-files/README/docs-restructure landing. Baseline verified green on
2026-11-01:

| Gate | State |
|---|---|
| `npm run ci` (lint 0-warn, coverage ratchets, build) | green |
| Coverage actual | 98.89% stmts / 94.91% branch / 99.05% funcs / **99.92% lines** (floors: 98.6/94.6/98.8/99.85) |
| E2e sweep (`packaging/e2e/webos-sweep.mjs`) | **31/31 phases, 0 page errors** (46 screenshots) |
| WCAG contrast | AAA enforced by test: 10 hard >=7:1 assertions across personas/danger/accent/ink — all pass |
| GitForge CI (`webos-deploy-ci`) | latest run (6764c00, 2026-11-01 18:55) **succeeded**; store-verified |
| ESLint | 127 rules incl. jsx-a11y recommended, react-hooks, strict set — clean |

## Phase R1 — Merge readiness (small, do now)

1. `git push` branch -> open PR -> merge to `main` (safeguards hooks already
   enforce the gate checklist).
2. Verify the GitHub-side toggle "auto-close issues with merged linked PRs"
   in Settings -> General -> Issues (REST does not expose it; record result).
3. Confirm repo settings match scaffolding defaults: auto-delete head
   branches, auto-merge enabled, Suggestions-for-PR-branches on.
4. Tag `v3.23.1` (docs/community release — no runtime change) -> GitHub
   release with the screenshot in the body.
5. Deploy: `npm run build && wrangler pages deploy webos/dist --project-name
   artcraft-webos` (or confirm Pages CI did it on merge).

## Phase R2 — GitForge trigger hygiene (infra fix, not repo defect)

Observed in `/var/lib/gitforge` store 2026-11-01: several failed runs with
`upload-pack: not our ref 0000…0000` and one `unable to read tree` — push
triggers arriving with null/absent commit refs. Latest push succeeded, so it
is intermittent infra, but:

1. File a GitForge issue: push hooks should refuse to enqueue a run whose
   `commit_hash` is the null OID instead of failing at checkout.
2. Add a retention/cleanup for `pipeline_runs` rows with null-ref errors.
3. Re-run any real commit whose only runs failed on this (verify none of
   *this* repo's commits lack a green run).

## Phase R3 — Lint/coverage ceiling push

1. Coverage: raise branch floor 94.6 -> 95.5 as the next ratchet step
   (actual 94.91); keep pushing per-component branch coverage in
   `src/shell/*` (Window, Screensaver, SaverPreview are the weakest).
2. Lint: add `eslint-plugin-react` recommended (currently only the two
   jsx-uses rules are on); evaluate `eslint-plugin-import` order/unambiguous.
   Each rule must pass after real fixes — no blanket disables (house rule).
3. Floating-promise discipline for JS: adopt `eslint-plugin-promise`
   (catch-or-return on the fire-and-forget paths in `src/os/db.js`).

## Phase R4 — Docs/workflow polish (from OSS benchmarks)

1. Add `.github/workflows/dependency-review.yml` (`actions/dependency-review`
   on PRs) — free, standard, zero maintenance.
2. Add CodeQL JS analysis workflow (weekly cron + PR) — the repo is pure JS;
   the Safeguards no-codeql template applies only if CodeQL is ruled out.
3. Adopt release-please (or a minimal tag-on-merge chore) so versions in
   `package.json`, tags, and Pages deploys stay mechanically linked.
4. Wiki: add an "Audio/Video codecs supported" page (frequent question class
   for browser media apps) and link it from FAQ.

## Phase R5 — Out of scope, record only

- 100% line coverage: last 4 uncovered lines are animation-timing guards;
  not reachable without faking time. Keep the ratchet, don't fake it.
- `npm audit`/dependabot: `package-lock` has 0 known vulns as of today;
  add Dependabot `package-ecosystem: npm` weekly once R4.1 lands.

## Review cadence

Re-baseline after each phase; update PROGRESS.md + HISTORY.md per the
session protocol in `docs/AGENTS.md`.
