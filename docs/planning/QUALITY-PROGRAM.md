# WebOS Quality Program — Coverage, Lint, A11y, CI

Status: in progress · owner: webos-deploy · created 2026-10-10
Scope: this repo's shipped surface — `webos/` (the OS shell), `packaging/`,
repo docs. The sibling craft checkouts are independent repos with their own
gates (`cargo xtask ci`) and are out of scope here.

## Baseline (measured 2026-10-10, v3.4.0)

| Surface | Size | Automated tests | Lint | CI | A11y |
|---|---|---|---|---|---|
| `webos/src` (JS/JSX) | 8,350 LOC / 72 files | 0 | none | none | none |
| `webos/src/styles.css` | 1,051 LOC | — | — | — | unaudited |
| `webos/scripts/screenshot-drive.mjs` | 1,477 LOC | manual, ~7 min/run | none | none | — |
| `packaging/*.sh` | ~500 LOC | 0 | shellcheck absent | none | — |

What exists today: one e2e driver (`screenshot-drive.mjs`, 38 CDP-driven
steps) run by hand against a local preview server; a Node shim suite for
`wasi.js` living in `/var/tmp` (not in the repo); no `test`/`lint` scripts in
`package.json`; no `.github/`, no GitForge pipeline file.

## Targets and ratchets

Honest framing: this program **installs** the quality infrastructure that is
missing and ratchets it, it does not claim 99% on day one. Gates enter in
warn-then-fail order so CI is green at every commit.

1. **Unit coverage (vitest + v8)**: ≥90% lines on `webos/src` overall,
   ≥99% lines on the pure logic modules (`os/`, `apps/terminal/wasi.js`,
   `apps/terminal/coreutils-commands.js`, `apps/editor/buffers.js`,
   `apps/calculator/engine|calcState`, `shell/winDrag.js`, `os/snap.js`).
   Browser-only glue (canvas loops, wasm instantiation) is covered through
   unit seams where practical and documented as excluded otherwise.
   Coverage gate in CI ratchets: start at the measured number, rise to 90.
2. **Lint (ESLint 9 flat config)**: `eslint:recommended` + react-hooks +
   jsx-a11y (strict) + import ordering; **zero warnings** gate (`-D warnings`
   parity with the Rust repos' clippy gate).
3. **A11y (WCAG 2.1 AA now, AAA contrast where tokens allow)**: jsx-a11y
   catches structure; a contrast auditor script computes WCAG ratios for
   every persona's token pairs from `personas.js`/`styles.css` and enforces
   AA (4.5:1 body text) with AAA (7:1) reported per pair; fixes or documented
   exceptions land in the same change that measures them.
4. **E2E**: the CDP driver becomes `npm run test:e2e` (same file, same
   output), still the integration gate; driver steps 36–38 cover saver,
   store personas, and terminal wasm.
5. **Docs coverage**: every module in `webos/src` has an entry in
   `docs/planning/webos-apps/ARCHITECTURE.md` §Module index; README carries
   dev/test/lint/coverage/deploy commands; `CLAUDE.md` stays truthful.
6. **Secrets/patterns (Aegis)**: `aegis -c production scan` over the repo,
   findings triaged into `.aegis-baseline.json` (accepted residuals, each
   with a reason) or fixed; scan wired into CI as a job.
7. **CI/CD**: GitHub Actions (`ci.yml`: install → lint → unit+coverage →
   a11y/contrast audit → build → e2e (manual/dispatch, needs chromium)) and
   a `.gitforce.yml` mirroring the same jobs for the local GitForge
   (`backend-fixed` dsc pattern). Local gate = the exact workflow commands,
   run before every push. GitForge **registration** of this repo needs
   operator credentials — documented follow-up, not a code change.

## Phases

| # | Phase | Deliverable | Gate |
|---|---|---|---|
| 1 | Toolchain | vitest+coverage, ESLint flat config, scripts, `aegis` baseline file | `npm run ci` green (lint on empty config, tests smoke) |
| 2 | Hygiene | Aegis scan triaged; TODO/FIXME/console audit; forbidden patterns absent | zero unexplained findings |
| 3 | Unit tests — logic | wasi.js (port shim suite in-repo), db.js (fake-indexeddb), os/*, calculator, editor buffers, winDrag | logic modules ≥99% lines |
| 4 | Unit tests — UI | testing-library over shell + apps (dispatch order, dialogs, store, settings) | src ≥90% lines, gate set |
| 5 | Strict lint pass | fix all findings under strict config; `-D warnings` | `npm run lint` zero warnings |
| 6 | A11y | jsx-a11y fixes; contrast auditor + persona token fixes; ARIA pass on windows/dialogs | auditor green (or baselined), no jsx-a11y errors |
| 7 | CI/CD + docs | `.github/workflows/ci.yml`, `.gitforce.yml`, README/ARCHITECTURE/CLAUDE.md updates | CI config valid; docs match commands |
| 8 | Release | version bump, `gh release create`, push, wrangler deploy, live verify | live site serves the release |

## Aegis triage (2026-10-10, phase 2)

`aegis -c production scan src` reports 39 findings — all triaged into
`webos/.aegis-baseline.json` (gate re-scan: "No findings detected"). Classes:

| Pattern class | Count | Verdict |
|---|---|---|
| australian-tfn / ssn-no-dashes / bank-routing / zip-code / phone-number | 20 | Numeric literals in CSS gradient geometry (px values), unit-conversion factors (0.2365882365…), FNV prime (2166136261), ms timeouts. Not secrets. |
| x-frame-options | 5 | Comments *describing* that third-party sites send XFO/CSP — documentation strings, not headers being set. |
| dom-xss (Terminal.jsx:346,348) | 2 | Accepted risk: the documented JS-eval escape hatch (`new Function('os', …)`). A terminal user can already open devtools; capability equals the platform. |
| ssrf (coreutils.js, weather/api.js) | 2 | Client-side fetches of the bundled wasm asset and the open-meteo API — the app's whole architecture is client-side by design. |
| hipaa-phi (functions.js:9) | 1 | The golden-ratio constant `phi`. |
| pci-cardholder-data (Graphing/PlotCanvas) | 3 | UI hint text ("drag to pan · double-click to reset") tripping the card-pattern regex. |
| insecure-random (functions.js:33) | 1 | Calculator's `rand()` — a calculator random button needs no CSPRNG. |

The full-repo scan (`aegis scan .`) additionally sweeps gitignored sibling
checkouts (uutils upstream CI scripts etc.) — those are not this repo's code
and are out of scope; CI scans `webos/src` from `webos/`.

## Non-negotiables carried from the craft rules

- No placeholders/stubs/fake data in shipped code; examples live in docs.
- Every bundled asset keeps a `docs/ATTRIBUTION.md` row (already true for
  `coreutils.wasm`; new dev-only npm deps do not ship to users).
- CSR-only, subpath-safe URLs (no root-absolute paths in shipped HTML).
- Conventional commits; never `git stash`/`push --force`; confirm before
  destructive ops.
