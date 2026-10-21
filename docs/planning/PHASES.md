# Phased Work Plan — ArtCraft WebOS

Generated 2026-10-21. Replaces and supersedes the "gaps and next steps"
portions of prior session records. Read HANDOFF.md first for context,
conventions, and the standing routine loop.

## Status at a Glance (2026-10-21)

| Dimension | Current | Target |
|---|---|---|
| Tests | 1273 specs / 82 files | steady growth |
| Coverage stmts | 98.44% | **99%+** |
| Coverage branches | **94.10%** | 95%+ |
| Coverage funcs | 98.21% | **99%+** |
| Lines | 99.92% | hold |
| Lint | 0 warnings | hold |
| Aegis | baseline + triage done | wire into CI |
| Shell scripts | untested | add shellcheck |
| FireCraft version | 0.1.0 (stale row) | resolve via H2.0 |
| Next release | 3.20.0 | per H6 checklist |

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

1. Add an `aegis-scan` job to `.github/workflows/ci.yml` after the lint job:
   ```yaml
   - name: security scan
     run: aegis scan . --baseline .aegis-baseline.json --format github
   ```
2. Add the same to `.gitforce.yml`.
3. Verify the job runs and produces annotations on the Actions run page.

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

## Phase P9 — Future Work (Not Started)

These are identified gaps with no current owner or timeline. They are
recorded here so they are not lost.

### P9.1 — EffectCraft web deployment

EffectCraft (`apps/effectcraft/`) has no upstream release zip and no
checkout under `apps/`. When it publishes or is checked out, follow H3.2
to add it to `fetch-apps.sh` and deploy from the fetched build.

### P9.2 — WebOS preview server security hardening

The preview server binds `[::1]` only for some vite commands
(known pitfall in HANDOFF.md). Audit all preview/bind logic and ensure
the server is consistently reachable at `127.0.0.1` for e2e runs.

### P9.3 — CDP driver as first-class test

The current `webos-sweep.mjs` is a headless-Chrome smoke test. It
exercises the full rendering pipeline but does not assert internal state.
Consider adding an e2e state-assertion test that uses the CDP client
to make assertions about JS state (window count, IndexedDB records, etc.)
in addition to the screenshot-based visual checks.

### P9.4 — `screenshot-drive.mjs` replacement

The legacy screenshot driver (`scripts/screenshot-drive.mjs`, 1,477 LOC)
is run manually. It should either be replaced by the `webos-sweep.mjs`
pattern or deprecated and removed from the repo.

### P9.5 — Cloudflare R2 asset automation

FireCraft's wasm is currently deployed via `wrangler pages deploy` and
also mirrored to R2. The R2 path (documented in `packaging/`) should be
automated so `wrangler r2 object put` is part of the release script, not
a manual step.

---

## Task Index

| # | Task | Phase | Status |
|---|---|---|---|
| 173 | Aegis HIGH triage | P3 | completed |
| 174 | Aegis MEDIUM triage | P3 | completed |
| 175 | Fix state.jsx listener leak | P3 | completed |
| 176 | Fix bridge.js listener leak | P3 | completed |
| 177 | Cover remaining branches (chat, notepad, editor, browser) | P1 | pending |
| 178 | Raise statement and function coverage to 99%+ | P2 | pending |
| 179 | Aegis baseline and rescan | P3 | completed |
| 180 | E2E sweep local validation | — | completed |
| 181 | Local CI simulation | — | completed |
| 182 | Update QUALITY-PROGRAM.md baseline | P7 | completed |
| — | Aegis wire into CI | P3 | pending |
| — | Shellcheck for packaging scripts | P3 | pending |
| — | Dependency refresh | P4 | pending |
| — | FireCraft H2.0 version sync | P5 | pending |
| — | Registry version audit (H3.3) | P6 | pending |
| — | Module index accuracy | P7 | pending |
| — | Release 3.20.0 | P8 | pending |
