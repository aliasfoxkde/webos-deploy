# Quality Gates

The full program record lives in
[planning/QUALITY-PROGRAM.md](../planning/QUALITY-PROGRAM.md); this page is
the working summary.

## The gates

| Gate | Where | Rule |
|---|---|---|
| Lint | `webos/eslint.config.js` | strictest ruleset, `--max-warnings 0` |
| Coverage | `webos/vitest.config.js` ratchet floors | statements/branches/functions/lines floors **only go up** — never lower one to pass; fix the change |
| WCAG 2.1 AAA | `webos/tests/contrast-audit.test.js` | every theme token, incl. wallpaper-extreme flattening + desktop scrim pills |
| Docs coverage | `webos/tests/docs-coverage.test.js` | ARCHITECTURE.md Module index must name every file under `src/` |
| Docs references | `webos/tests/docs-references.test.js` | every backticked repo path in root docs must exist |
| Registry versions | `webos/tests/registry-versions.test.js` | 12/12 craft-app rows match the deployed bundle |
| E2E sweep | `packaging/e2e/webos-sweep.mjs` | 27 phases in CI, console errors attributed per phase |
| Shellcheck + Aegis | CI | shell scripts linted; scanner pinned to `aliasfoxkde/aegis` (baseline-gated) |

CI mirrors these in `.github/workflows/ci.yml` and `.gitforce.yml`.

## Principles

- **Ratchets only go up.** Lowering a floor or deleting a test to go green
  is a stop-the-line violation.
- **A measured metric must be reproducible.** Anything timing- or
  order-dependent is a broken gate.
- **Every fix ships with a regression test** naming the failure it prevents.
