# OSS-Readiness Plan — closeout (2026-11-01)

Status after [PR #14](https://github.com/aliasfoxkde/ArtCraft-WebOS/pull/14)
merged as `605e0a9` on 2026-11-01. The public default branch now contains
the README, product vision, onboarding, community, licensing, and security
documentation described here.

| Gate | State |
|---|---|
| `npm run ci` (lint 0-warn, coverage ratchets, build) | green |
| Coverage actual | 98.89% stmts / 94.91% branch / 99.05% funcs / **99.92% lines** (floors: 98.6/94.6/98.8/99.85) |
| E2e sweep (`packaging/e2e/webos-sweep.mjs`) | **31/31 phases, 0 page errors** (46 screenshots) |
| WCAG contrast | AAA enforced by test: 10 hard >=7:1 assertions across personas/danger/accent/ink — all pass |
| GitForge CI (`webos-deploy-ci`) | latest run (6764c00, 2026-11-01 18:55) **succeeded**; store-verified |
| ESLint | 127 rules incl. jsx-a11y recommended, react-hooks, strict set — clean |

## Phase R1 — Merge readiness

1. [x] PR #14 merged to `main` after its CodeQL result succeeded. The full
   WebOS CI run subsequently passed, including lint, Aegis, Shellcheck, docs
   gates, tests/coverage, build, and E2E.
2. [ ] Verify the GitHub-side toggle "auto-close issues with merged linked
   PRs" in Settings → General → Issues. REST does not expose it; remains
   unverified.
3. [x] Public visibility, Issues, Discussions, Wiki, auto-merge,
   auto-delete-head-branches, private vulnerability reporting, and
   secret-scanning push protection are enabled. Update-branch suggestions
   and release immutability were verified during repository setup.
4. [x] No release/tag was cut: this PR changes docs and repository metadata,
   not the runtime. Record a docs-only release separately if desired.
5. [x] No Pages deployment was triggered; the live prototype was unchanged.

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
2. [x] Add a pinned CodeQL JS/TS analysis workflow (weekly cron + PR). Its
   first analysis passed (Actions run 41343478261).
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

## Merge-gating finding

PR #14 auto-merged after CodeQL passed while the broader CI job was still in
progress. That CI job later passed (Actions run 41343478209). The active
Safeguards ruleset originally required CodeQL but not the repository's full
CI status check, so the merge could happen early. A required-status-check
rule now requires the GitHub Actions check named `webos — lint, test,
coverage gate, contrast audit, build, e2e`, with strict up-to-date testing.
This is a repository-specific rule added without removing any Safeguards.

GitHub Code Quality did not run on this PR. It is a separately billed
feature; do not enable it without explicit cost authorization. The inherited
ruleset retains its Code Quality rule, which only evaluates when the feature
is available and configured.
