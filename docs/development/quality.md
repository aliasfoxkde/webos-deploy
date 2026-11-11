# Quality Gates

The full program record lives in
[planning/QUALITY-PROGRAM.md](../planning/QUALITY-PROGRAM.md); this page is
the executable summary. Historical audit details remain in the linked
program record; current product acceptance is in
[the MVP execution plan](../planning/MVP-EXECUTION-PLAN.md).

## The gates

| Gate | Where | Rule |
|---|---|---|
| Lint | `webos/eslint.config.js` | strictest ruleset, `--max-warnings 0` |
| Coverage | `webos/vitest.config.js` ratchet floors | statements/branches/functions/lines floors **only go up** — never lower one to pass; fix the change |
| WCAG 2.1 AAA | `webos/tests/contrast-audit.test.js` | every theme token, incl. wallpaper-extreme flattening + desktop scrim pills |
| Docs coverage | `webos/tests/docs-coverage.test.js` | ARCHITECTURE.md Module index must name every file under `src/` |
| Docs references | `webos/tests/docs-references.test.js` | every backticked repo path in root docs must exist |
| Registry versions | `webos/tests/registry-versions.test.js` | 13/13 external Craft-app rows match the deployed bundle |
| E2E sweep | `packaging/e2e/webos-sweep.mjs` | the current sweep phases in CI, console errors attributed per phase |
| Shellcheck + Aegis | CI | shell scripts linted; scanner pinned to `aliasfoxkde/aegis` (baseline-gated) |
| CodeQL | `.github/workflows/codeql.yml` | pinned JavaScript/TypeScript security-extended scan on pull requests, main pushes, and weekly |

Application and repository gates run in `.github/workflows/ci.yml` and
`.gitforce.yml`. CodeQL runs separately. The active GitHub Safeguards ruleset
requires both CodeQL results and the full WebOS CI check before merge. GitHub
Code Quality is a separate billed feature and was not enabled as part of this
setup; the PR had no Code Quality analysis result.

The latest recorded full main CI receipt is 2026-11-03 on
`5b4fe552428f2fc02e7887897ceeb1744edb8fec`; scheduled CodeQL passed
2026-11-09 on that same SHA. These receipts do not validate later PR
branches. Check the live workflow runs for the exact candidate commit.

## Principles

- **Ratchets only go up.** Lowering a floor or deleting a test to go green
  is a stop-the-line violation.
- **A measured metric must be reproducible.** Anything timing- or
  order-dependent is a broken gate.
- **Every fix ships with a regression test** naming the failure it prevents.
