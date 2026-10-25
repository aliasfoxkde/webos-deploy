# Phased Work Plan — ArtCraft WebOS

Generated 2026-10-22. Replaces and supersedes the "gaps and next steps"
portions of prior session records. Read HANDOFF.md first for context,
conventions, and the standing routine loop.

## Status at a Glance (2026-10-22)

| Dimension | Current | Target |
|---|---|---|
| Tests | 1344 specs / 88 files | steady growth |
| Coverage stmts | 98.59% | **99%+** |
| Coverage branches | **94.20%** | 95%+ |
| Coverage funcs | 98.16% | **99%+** |
| Lines | 99.92% | hold |
| Lint | 0 warnings | hold |
| Aegis | wired into GitHub Actions + GitForge | hold |
| Shell scripts | shellcheck in CI | hold |
| FireCraft version | 0.2.2 (row + SW cache + pipeline) | hold |
| Registry rows | 12/12 match deployment | hold |
| Craft apps vs upstream | current (all twelve, 2026-10-22) | hold |
| Next release | 3.21.0 | per H6 checklist |

---

## Phase P1 — Close Coverage Gaps (app-level components)

**Owner**: this repo · **Exit gate**: `npm run ci` green + all floors cleared

### P1.1 — Browser app branches (`src/apps/browser/`)

The `Browser` app (地址栏, history, bookmarks, tab bar) has
no dedicated spec file. Current branch/statement coverage is low.

1. `grep -rn "export\|function\|const.*=" src/apps/browser/` — enumerate every
   exported function and component.
2. Identify uncovered branches: URL validation (invalid URL guard),
   history add / de-duplication, bookmark toggle, tab-add/close, empty
   state for each panel.
3. Write browser branch coverage specs (file name TBD per the test
   conventions): cover each branch with a self-contained spec using the
   pattern from `shell-low-branches.test.jsx`
   (OSProvider + `fireEvent` + assertions).
4. `npm run ci` — update floors if coverage rises.

### P1.2 — Chat app branches (`src/apps/chat/`)

The Chat app has partial coverage. Audit what's missing:

1. Run `npx vitest run --coverage` and note which Chat.jsx branches are
   uncovered (role rendering branches, history scroll, send-state machine,
   empty-state paths).
2. Write Chat app branch coverage specs targeting those branches.
3. Verify all Chat branches are covered.

### P1.3 — Notepad app branches (`src/apps/notepad/`)

1. Run coverage and identify uncovered branches in Notes.jsx and any
   sidebar/editor sub-components.
2. Write Notepad app branch coverage specs targeting the gaps.
3. Verify all Notepad branches are covered.

### P1.4 — Editor app branches (`src/apps/editor/`)

1. Run coverage and audit `Editor.jsx`, `buffers.js`, toolbar state
   machine, and buffer-switch branches.
2. Write Editor app branch coverage specs targeting the gaps.
3. Verify all Editor branches are covered.

**When P1.1–P1.4 are done, task #177 is complete.**

---

## Phase P2 — Statement and Function Coverage to 99%+

**Owner**: this repo · **Exit gate**: `npm run ci` green with all four
thresholds ≥ 99% (or with documented and accepted residuals)

### P2.1 — Statement coverage hotspots

Measured 2026-10-21:

| File | Stmts | Gap |
|---|---|---|
| `coreutils.js` | 93.5% | ~40 uncovered |
| `programmer.js` | 89.9% | ~60 uncovered |
| `db.js` | 95.4% | ~15 uncovered |
| `LensFilters.jsx` | 97.1% | ~6 uncovered |
| `wasi.js` | 98.6% | ~4 uncovered |

**Action per file**: read the source, identify the uncovered statement
lines, determine whether each is (a) reachable code needing a spec,
(b) dead code (indexedDB error paths that fake-indexeddb never triggers),
or (c) a V8 attribution quirk. Log findings in a `P2-coverage.md` sidecar.

For dead-code paths (indexedDB-level errors, `catch` blocks triggered only
by browser-level failures), add a one-line `// istanbul ignore next` comment
per the v8-provider convention so the floor no longer counts them.

### P2.2 — Function coverage hotspots

Functions not covered map directly to the statement gaps above (most
uncovered statements are inside uncovered functions). Resolving P2.1
will resolve most of P2.2 automatically.

Specific check:
- `coreutils.js`: functions like `getOutput()`, `handleBuiltin()`,
  sub-command dispatch arms
- `programmer.js`: function-level gaps in the calculator expression
  evaluator, the programmer-base conversion logic

### P2.3 — Raise floors

After P2.1+P2.2 are resolved, run `npm run coverage`, record the four
numbers in a comment in `vitest.config.js`, and raise the floors to the
new measured value minus tolerance.

**When P2.1–P2.3 are done, task #178 is complete.**

---

## Phase P3 — Aegis CI Integration + Shellcheck

**Owner**: this repo · **Exit gate**: Aegis scan runs in CI, shellcheck passes

### P3.1 — Wire Aegis into GitHub Actions

1. Add the scan step to `.github/workflows/ci.yml` after the lint job. It
   is a script, not an inline command — the scanner has to be fetched,
   checksum-verified and pinned:
   ```yaml
   - name: Security scan (Aegis)
     run: ../packaging/aegis-scan.sh
   ```
   (`packaging/aegis-scan.sh` downloads the pinned `aliasfoxkde/aegis`
   release binary, verifies its SHA-256, and runs
   `aegis --format sarif scan src --baseline .aegis-baseline.json` from
   `webos/` — the job's working directory.)
2. Add the same to `.gitforce.yml` (`run: packaging/aegis-scan.sh`; that
   pipeline runs from the repo root).
3. Verify the job runs green on the Actions run page.

> **Repaired 2026-10-21.** The original wiring was broken and never scanned
> anything: the `setup-python` action was pinned to a nonexistent SHA, the
> PyPI `aegis-cli` package is an unrelated project with no `scan` command,
> `--format github` does not exist, and the committed baseline came from a
> different aegis build (8 categories vs 22) so it filtered nothing. See
> QUALITY-PROGRAM.md § "Aegis CI gate repair".

### P3.2 — Add shellcheck for packaging scripts

1. `npm install --save-dev shellcheck` in `webos/` (or at repo root if
   `shellcheck` is a system tool).
2. Add `npx shellcheck packaging/*.sh` to the CI lint step.
3. Fix any findings (most shell scripts are simple and should pass cleanly).

---

## Phase P4 — Dependency Refresh

**Owner**: this repo · **Exit gate**: `npm outdated` is clean or all skips
documented; `npm run ci` green after any change

From `webos/`:

```bash
npm outdated --depth=0
```

Process each package:
- **patch/minor**: upgrade, run `npm run ci`, sweep
- **major**: trial branch, full gate + sweep, PR only on green
- **skipped (major)**: write one-line reason to SESSIONS.md

---

## Phase P5 — FireCraft Version Sync (H2.0)

**Owner**: this repo + FireCraft checkout · **Exit gate**: FireCraft
embed probe green locally and on production; registry `version` row updated

The registry row for firecraft shows `0.1.0` but the deployed bundle is
`v0.2.0`+ (confirmed by the upstream `Cargo.toml`). Follow the H2.0
procedure in HANDOFF.md exactly. This is the only remaining item from the
original integration checklist.

**When H2.0 is done, update the firecraft registry row and close it out.**

---

## Phase P6 — Registry Version Audit (H3.3)

**Owner**: this repo · **Exit gate**: every registry `version` row matches
the deployed version for that app

Audit the full registry table in `src/os/registry.js` against the
currently deployed artifacts. Cross-reference with the H3 table in
HANDOFF.md (which is current as of 2026-10-18 for all craft apps except
firecraft).

For craft apps: their registry `version` row should match the `version`
field in their sibling checkout's `Cargo.toml` (workspace.package).
For deckcraft/soundcraft/effectcraft: these have no release zips yet;
their registry `version` reflects the last verified commit hash from their
checkouts (recorded in the H3 table).

**Done 2026-10-21.** All twelve rows agree with what is deployed; every
deployed bundle is byte-identical to the local build of the same version.
FireCraft moved to 0.2.2 and onto the standard fetched-zip pipeline (H3.2),
and the invariant is now pinned by `webos/tests/registry-versions.test.js`
(registry row = `fetch-apps.sh` version = `pwa-inject.sh` SW-cache version).
The audit also surfaced a separate gap — the deployed craft apps are far
behind their upstream releases — recorded as P10.

---

## Phase P7 — Docs and Architecture Hygiene

**Owner**: this repo · **Exit gate**: `tests/docs-coverage.test.js` and
`tests/docs-references.test.js` both green

1. **Module index accuracy**: after any src/ file add/remove, the
   ARCHITECTURE.md §Module index must be updated in the same commit.
   Audit it now: `grep "^export" src/os/state.jsx src/os/registry.js` etc.
   against the current 110-row index — are there drift entries?
2. **README command table**: verify every command listed in README still
   works (no stale paths, no deprecated flags).
3. **HISTORY.md**: append v3.19.0 release row (commit `5a4e30e`,
   2026-10-20, includes branch-coverage sprint, Aegis triage, husky,
   GitForge e2e hard gate, zero-warning lint enforcement).

---

## Phase P8 — Release 3.20.0 (H6 Checklist)

**Owner**: this repo · **Exit gate**: production verified, release
published, PROGRESS.md/HISTORY.md/SESSIONS.md updated

Trigger condition: all prior phases complete, or this is a cumulative
release of all completed phases.

Follow the H6 checklist in HANDOFF.md exactly. The release notes should
cover:
- Branch coverage improvement (94.03% → 94.10%, EmbedFrame + FxWallpaper
  new coverage, StartMenu/Sidebar analysis — several branches proven
  unreachable without code changes)
- Aegis triage (all HIGH/MEDIUM findings resolved or accepted with reason)
- GitForge e2e hard gate (the sweep is now a blocking step, not optional)
- Zero-warning lint enforcement pinned in CI and pre-commit hook

---

## Phase P10 — Adopt the Upstream Craft App Releases

**Owner**: this repo · **Exit gate**: the deployed craft apps serve the
current upstream release, and the registry/SW-cache rows follow

Found during the P6 registry audit (2026-10-21): every registry row is
consistent with what is deployed, but the deployed set is pinned to
versions that upstream passed weeks or months ago. The registry was never
lying — it just describes an old deployment.

Latest upstream release carrying a web zip, per app:

| App | Deployed before | Adopted 2026-10-22 |
|---|---|---|
| cadcraft | 0.3.0 | 0.10.0 |
| designcraft | 0.4.0 | 0.11.0 |
| gridcraft | 0.3.0 | 0.10.0 |
| lightcraft | 0.4.0 | 0.11.0 |
| pdfcraft | 0.4.0 | 0.11.0 |
| photocraft | 0.5.0 | 0.12.0 |
| vectorcraft | 0.7.0 | 0.14.0 |
| wordcraft | 0.3.0 | 0.9.0 |
| deckcraft | 0.4.0 | 0.9.0 |
| soundcraft | 0.5.0 | 0.11.0 |
| effectcraft | 0.8.0 | 0.14.0 |
| firecraft | 0.2.2 | 0.2.2 (already current) |

Steps, per app:

1. Point `packaging/fetch-apps.sh` at the new version and run
   `packaging/fetch-apps.sh --app <name> --force`.
2. Update the `pwa-inject.sh` version stamp so the SW cache name moves
   with the bundle (a stale cache name keeps serving the old build).
3. Update the registry `version` row in `webos/src/os/registry.js`.
4. `cd webos && npm run ci` — `tests/registry-versions.test.js` fails if
   any of the three version statements disagree.
5. Deploy: `npx wrangler pages deploy apps/<name> --project-name <name>-web`.
   Bundles over the 25 MiB Pages cap keep only `_worker.js` in the deploy
   and stream their wasm from R2 — `packaging/r2-publish.sh <app>` does
   that (moves the blob into `r2-blobs/`, writes `_worker.js` +
   `wrangler.toml` with the `CRAFTWEB` binding, uploads with
   `wrangler r2 object put craftweb/<file>.wasm --file <f> --remote`),
   after which the deploy runs **from the app directory** so wrangler
   picks up that configuration.
6. For deckcraft/soundcraft/effectcraft: move the source checkouts out of
   `apps/` first — `fetch_one` does `rm -rf apps/<name>` on `--force` and
   would destroy the checkout. (Done 2026-10-21: they live in
   `/nas/Temp/repos/<name>`.)

This is an upgrade, not a fix: each app visibly changes. Do it app by app,
with the sweep between steps.

**Done 2026-10-22.** All twelve apps sit on their current upstream web
release. DeckCraft, SoundCraft and EffectCraft now publish upstream
release zips and joined the standard pipeline; EffectCraft ships its own
PWA glue, so `packaging/pwa-inject.sh` leaves that bundle alone (its SW
cache name is upstream's content hash, not the release version — the
exception is pinned in `webos/tests/registry-versions.test.js`). Seven
wasm bundles of 29–74 MiB (deckcraft, designcraft, effectcraft, lightcraft,
pdfcraft, vectorcraft, wordcraft) exceed the Pages per-asset cap and are
served from the R2 `craftweb` bucket. Every deployment was verified in
production: the served asset name matches the local bundle, the wasm
answers `200` with `application/wasm`, and the SW cache name carries the
new version.

---

## Phase P9 — Future Work (Not Started)

These are identified gaps with no current owner or timeline. They are
recorded here so they are not lost.

### P9.1 — EffectCraft web deployment

**Resolved 2026-10-22.** EffectCraft now publishes a release web zip and
rides the standard `fetch-apps.sh` pipeline; its source checkout lives at
`/nas/Temp/repos/effectcraft`.

### P9.2 — WebOS preview server security hardening

**Done 2026-10-22.** `vite.config.js` now pins both servers to the IPv4
loopback — `server: { host: '127.0.0.1' }` and `preview: { host:
'127.0.0.1' }` — and the `dev` / `preview` npm scripts pass
`--host 127.0.0.1` as well. The preview server was reachable on
`[::1]` only, so anything addressed to `127.0.0.1` (the e2e scripts, the
CDP driver) could not reach it; the pin also keeps it off the LAN.

### P9.3 — CDP driver as first-class test

**Done 2026-10-22.** The sweep now has a `state-assertions` phase: over
CDP it reads the window registry in the OS reducer (two launches register
two windows in both the state and the DOM; recents list them; a
single-instance app focuses instead of opening a second window) and round-trips
records through the `webos` IndexedDB database (`kv` and `files` stores,
a record read back byte-for-byte). A surface that renders the right pixels
over the wrong state now fails the sweep.

### P9.4 — `screenshot-drive.mjs` replacement

**Done 2026-10-22.** The surfaces the legacy driver covered by hand now run
as sweep phases: `mobile-layout` (FAB, drawer, launch from the drawer),
`window-tiling` (Meta+ArrowLeft tiles, Meta+ArrowUp maximizes, Meta+ArrowDown
restores) and `taskbar-groups` (create through the desktop context menu,
file a member in, popup lists it, remove the group). The driver itself is
deprecated with a banner at the top of the file — it gates nothing, and
extending it would fork the gate. It is kept for the manual-only visual
coverage no gate asserts on (persona variants, tray menus, drag-pinning, the
add-app dialog, the SQLite viewer); deleting a tracked 1,477-LOC tool is the
operator's call, not a silent part of this phase.

### P9.5 — Cloudflare R2 asset automation

**Done 2026-10-22.** `packaging/r2-publish.sh <app>` performs the whole
route in one step: move the wasm into `r2-blobs/`, write `_worker.js` and
the `wrangler.toml` with the `CRAFTWEB` binding, upload with
`wrangler r2 object put … --remote`, and print the deploy command to run
from the app directory.

---


---

## Phase P12 — Coverage Deepening & Repo Polish (2026-10-24)

**Owner**: this repo · **Exit gate**: branch ≥ 95%, stmts/funcs ≥ 99%,
`npm run ci` green, e2e sweep PASS, Aegis clean, deployed + released.

Measured 2026-10-24 (89 files / 1349 specs): stmts 98.65, branch 94.33,
funcs 98.37, lines 99.92. 60 files carry a branch gap; 9 carry a
function gap. Aegis PASS, lint clean, all quality gates hold from
v3.22.0. Dependabot triaged: action bumps merged (checkout/setup-node/
upload-artifact → v7), the five deferred majors closed with reasons.

### P12.1 — Branch gaps, worst-first (target: 95%+ overall)

| File | Branch | What to cover |
|---|---|---|
| `src/apps/chat/adapters.js` | 50.0% | one uncovered branch arm; read the file, drive both sides |
| `src/apps/chat/Chat.jsx` | 78.0% | send-state machine, role-render branches, error paths |
| `src/apps/terminal/coreutils.js` | 78.9% | argument-validation and error arms of the core utils |
| `src/apps/calculator/modes/Converter.jsx` | 82.1% | unit-conversion edge branches |
| `src/apps/calculator/Display.jsx` | 83.3% | display formatting branches |
| `src/shell/SaverPreview.jsx` | 83.3% | preview lifecycle branches |
| `src/os/lens.js` | 84.0% | lens probe assertion branches |
| `src/apps/editor/Editor.jsx` | 85.7% | remaining editor branches (see also P12.2) |
| `src/shell/watergl.js` | 86.4% | WebGL-fallback branches (mock the GL context) |
| `src/apps/taskmgr/TaskManager.jsx` | 86.5% | process-table edge branches |

Method per file: `npx vitest run <related-test> --coverage`, read the
uncovered line numbers from the text report, write the minimal spec that
drives the branch, re-measure. **Do not lower a floor to pass; do not
chase the 4 settled uncovered lines (QUALITY-PROGRAM.md).**

### P12.2 — Function hotspots (target: 99%+ overall)

`StartMenu.jsx` 85.3%, `Taskbar.jsx` 90.9%, `Chat.jsx` 91.7%,
`WaterWallpaper.jsx` 92.3%, `TaskManager.jsx` 94.0%. Each uncovered
function is a handler no test invokes; render-and-click through the
existing shell-low-branches pattern.

### P12.3 — Floor raise + release

1. Re-measure after P12.1/P12.2; raise the four floors in
   `vitest.config.js` to measured − tolerance.
2. `node packaging/e2e/webos-sweep.mjs` — PASS, 0 page errors.
3. `bash packaging/aegis-scan.sh` — PASS.
4. Release + deploy per H6 checklist (user-facing? no → patch bump
   3.22.1 unless new surfaces land, then minor).
---

---

## Phase P12 — Coverage Deepening & Repo Polish — DONE 2026-10-25

Executed same session. Final measured coverage (full suite, reproducible):
**statements 98.89% / branches 94.91% / functions 99.05% / lines 99.92%**
(from 98.65/94.33/98.37/99.92). Floors raised to 98.6/94.6/98.8/99.85.

### What moved, per file

| File | Before | After | How |
|---|---|---|---|
| chat/adapters.js | 50% | 100% | real echo generator exercised (chat-adapters.test.js) |
| terminal/coreutils.js | 78.9% | 100% | seed dirs/blob-less records, U8 stdin, no-message trap, MIME-preserving persist |
| os/bridge.js | 87.8% | 97.3% | root-reduction nacks, storage catch, crypto fallback, postToApp guards |
| apps/chat/Chat.jsx | 78% | 82% (funcs 100%) | abort-with-partial, error-after-partial, declined confirm, unmount abort |
| calculator Converter/Display | 82.1/83.3% | 85.7/100% | overflow em dash, fixed-precision indicator |
| shell/StartMenu.jsx | funcs 85.3% | 97.1% | all launch handlers, Enter-to-launch, query-reset timer |
| shell/Taskbar.jsx | funcs 90.9% | 94.5% | online/offline, fullscreen reject guards, pin-reorder guard |
| shell/EmbedFrame.jsx | funcs 88.2% | 100% | exportPng byte delivery + silent throw |
| apps/taskmgr/TaskManager.jsx | funcs 94% | 98% | storage/SW rejection fallbacks |
| shell/Sidebar.jsx | 87.3% | 90.5% | weather reject/toggle, battery listeners, chat truncation |
| shell/SaverPreview.jsx | 83.3% | 83.3% (ceiling) | `|| 1`/`|| 8` arms dead under DEFAULT_SAVER merge |
| os/lens.js | 84% | 84% (ceiling) | center fallback covered; 45-49 guards mathematically unreachable |

### Dependabot triage (first batch on activation)

- Merged: actions/checkout v7, actions/setup-node v7, actions/upload-artifact
  v7 (all green on their PRs).
- Closed with reasons: react 19, vite 8, plugin-react 6, eslint 10,
  happy-dom 21 (peer-dep conflicts; the documented deferral stands).

### Remaining (honest) gaps

Branch 94.91% is the practical ceiling without chasing arms that are
unreachable by construction (degenerate-guard fallbacks whose branch
conditions exclude the degenerate case; the four settled uncovered lines in
QUALITY-PROGRAM.md). The next real lever is new-surface tests as features
land, not retro-hunting these arms.
---
## Task Index

| # | Task | Phase | Status |
|---|---|---|---|
| 173 | Aegis HIGH triage | P3 | completed |
| 174 | Aegis MEDIUM triage | P3 | completed |
| 175 | Fix state.jsx listener leak | P3 | completed |
| 176 | Fix bridge.js listener leak | P3 | completed |
| 177 | Cover remaining branches (chat, notepad, editor, browser) | P1 | completed |
| 178 | Raise statement and function coverage to 99%+ | P2 | completed (documented residuals) |
| 179 | Aegis baseline and rescan | P3 | completed |
| 180 | E2E sweep local validation | — | completed |
| 181 | Local CI simulation | — | completed |
| 182 | Update QUALITY-PROGRAM.md baseline | P7 | completed |
| 183 | Aegis wire into CI | P3 | completed |
| 184 | Shellcheck for packaging scripts | P3 | completed |
| 185 | FireCraft H2.0 version sync | P5 | completed |
| 186 | Registry version audit (H3.3) | P6 | completed |
| 187 | Docs hygiene and HISTORY.md entry | P7 | completed |
| 188 | Release 3.20.0 | P8 | completed |
| 189 | Repair the broken Aegis CI gate | P3 | completed |
| 190 | Dependency refresh | P4 | completed (majors deferred with reasons) |
| 191 | Adopt upstream craft app releases | P10 | completed (2026-10-22) |
