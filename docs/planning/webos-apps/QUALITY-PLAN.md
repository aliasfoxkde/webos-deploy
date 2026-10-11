# WebOS Quality Plan — phases, gaps, and how we climb

Written 2026-10-11 after the v3.9.0 release. This is the working plan for the
standing quality directive: 99% test/code/docs coverage, WCAG 2.1 AAA,
strictest linting, validated CI (GitHub Actions **and** local GitForge),
Aegis pattern scanning, and an app-polish queue. It is honest about where
the numbers actually are.

## Ground truth (2026-10-11, post-3.9.0)

| Metric | Now | Target | Gap |
|---|---|---|---|
| Statements | 77.5% (4708/6077) | 99% | ~1310 stmts to cover |
| Branches | 72.1% (2803/3886) | 99% | ~1045 branches |
| Functions | 70.1% (1130/1612) | 99% | ~465 functions |
| Lines | 80.5% (3712/4613) | 99% | ~855 lines |
| Tests | 616 / 46 files | — | growing each phase |
| Lint | eslint, zero warnings | strictest clean | escalate config |
| CI | GitHub Actions + `.gitforce.yml` | GitForge-validated | repo not yet registered in local GitForge |
| E2E | ad-hoc CDP harness (scratch) | committed `npm run e2e` | formalize |

Worst coverage areas (v8, by lines): calculator modes `Keypad`/`Scientific`
0%, `coreutils.js` 3.8%, `Converter`/`Programmer` ~5.6%, calculator modes
overall 10%, `settings/Panels.jsx` 11.8%, `Appearance.jsx` 39.7%,
`wasi.js` 46%, `App.jsx` wiring 51.6%, terminal 63.6% (lines), taskmgr 76%.

## Phases

### Phase A — foundations (first, cheap, unblocks everything)
- **A1. Register webos-deploy in the local GitForge** (`gitforge` CLI,
  mkinney credentials at `~/.config/gitforge/`), push, let `.gitforce.yml`
  trigger on `fedora-docker` (online, capacity 5) and watch all five gates
  pass. This is the "validate CI/CD locally" requirement and moves heavy
  `npm ci` + suite work off the NAS onto the Fedora box.
- **A2. Repo cleanup**: stale `/var/tmp` chromium profiles + screenshots
  from harness debugging; confirm `apps/ zips/ r2-blobs/ dist/` remain
  gitignored build artifacts (never committed); prune dead scripts.
- **A3. Commit this plan + task list** (#81–#84 plus coverage phases).

### Phase B — e2e suite, formalized (#85)
Promote the proven CDP harness (`/var/tmp/webos-verify.mjs` pattern) into
the repo: `webos/e2e/run.mjs` + `npm run e2e` (build → preview →
headless-Chromium checks → screenshots to `/var/tmp`). Cover: boot,
start menu open/search/launch, window lifecycle, taskbar alignment
geometry (the #70 checks), context menus, photos viewer fit, taskmgr
render, screensaver preview. Add an optional GitForge/GitHub CI step so
the browser lane runs on the Fedora runner, not the NAS.

### Phase C — app polish queue (user-visible, ordered by user request)
- **C1 (#81). Task Manager UI overhaul** — persona-token theming, spacing/
  hierarchy, table + sysmon readability. Screenshot-verified.
- **C2 (#82). Photos scale-to-fit default** — fix the fit/box math or CSS
  gutter so images never overlap the filmstrip scrollbar; zoom still
  available.
- **C3 (#83). Photos markup + editing** — non-destructive markup layer
  (pen/shapes/text) + imops-backed edits (crop/rotate/flip/exposure) with
  before/after + reset.
- **C4 (#84). Screensaver previews** — live mini-preview + drawn-in-code
  thumbnails in Settings → Screen saver; reduced-motion aware; no leaked
  timers.

### Phase D — coverage assault (ratchet climbs every landing)
Ordered by leverage (self-contained → entangled):
- **D1. Calculator modes** (worst: 0–10%) — mode components against the
  already-tested calc engine.
- **D2. settings/Panels.jsx + Appearance.jsx** — one interaction test per
  control (the #70 pattern: assert state + persistence + body-attr).
- **D3. App.jsx wiring** — keyboard/tiling/pointer paths via app-shell
  integration tests.
- **D4. wasi.js + terminal internals** — table-driven syscall/line-edit
  cases.
- **D5. taskmgr/photos/files leftovers** — grows naturally with Phase C.
Ratchet: raise `vitest.config.js` thresholds at every green landing; never
lower. Floors are the contract; 99% is the destination.

### Phase E — lint + a11y escalation
- **E1.** Tighten eslint (no-restricted-syntax for banned patterns,
  react-hooks strictness already on; evaluate `eslint-plugin-jsx-a11y`
  strict + `@stylistic` where it doesn't fight the existing style) — only
  rules the tree can pass cleanly; fix-then-enable, never
  enable-then-ignore.
- **E2.** Extend the WCAG auditor beyond contrast: focus-visible coverage,
  hit-target sizes, aria-names on interactive elements (static-analysis
  contract tests in the vitest suite, matching the existing
  `contrast-audit.test.js` approach).

### Phase F — docs to 99%
- **F1.** Make docs coverage *measurable*: a contract test asserting
  ARCHITECTURE.md documents every `src/` module dir + every persisted
  settings slice + every registry app (the docs-drift pattern already
  proven by `os-registry.test.js`).
- **F2.** README + ARCHITECTURE updates per landed phase (keep honest).

### Phase G — housekeeping
- **G1.** System audit: load 8+ on the NAS during runs — keep big jobs on
  `fedora-docker`; retired GitForge runners are operator-cleanup
  candidates (flagged, not deleted).
- **G2.** Aegis scan every changed file batch (established: JSX
  `pii-output-marker` highs are the known false-positive class).

### Ship
Every phase lands with: gates green → Aegis → commit+push → (release +
deploy at the batch boundary). Version discipline: minor bump per
user-visible batch, per repo convention.

## Honest constraints
- 99% functions is the mountain (~465 uncovered); D1/D2 alone hold most of
  it. Phases interleave: app work in C raises D5 for free.
- GitForge registration needs the CLI token flow to work headlessly; if
  auth blocks automation, that's a named blocker to surface, not skip.
- The NAS JBOD spins down; browser-e2e on the NAS is slow for the same
  reason (25s cold boot) — another reason E2E belongs on the Fedora lane.

## Defect ledger (operator-reported, fixed + verified)

| Date | Symptom | Root cause | Fix | Verification |
|---|---|---|---|---|
| 2026-10-11 | FX screensavers + the Settings preview render one frozen frame | FxWallpaper honored `prefers-reduced-motion: reduce` by never starting the rAF loop — savers froze at frame zero whenever the OS/browser reports reduce | `motion="gentle"` prop: savers loop at 0.35× under reduced motion; wallpapers keep the honest static frame | headless A/B: reduced=true was 1/3 identical canvas samples → now 3/3 distinct; `motion="gentle"` regression test in shell-window.test.jsx |
| 2026-10-11 | Clicking Browser blanked the entire desktop | SW served the shell cache-first → after a deploy an old `index.html` lazy-imports a hashed chunk the deploy deleted → rejected import, **zero error boundaries anywhere** → React unmounted the whole tree (reproduced: `rootChildren: 0`) | (1) `ErrorBoundary` two tiers — soft per-window card (Reload/Close) + hard root boundary; (2) SW shell now network-first, cache only as offline fallback | e2e chunk-block repro: was DESKTOP-BLANK → now desktop intact with in-window card (screenshot); 5 containment tests in shell-boundary.test.jsx |
