# Handoff — ArtCraft WebOS

Everything a future agent (or human) needs to continue this work
systematically. Written 2026-10-13 after the quality program (v3.14.0) and
the FireCraft integration (v3.15.0). Read this top to bottom before
touching anything; then work the phases in [PROGRESS.md](PROGRESS.md)
order, ticking tasks as you complete them.

## Read these first (in order)

1. Root `CLAUDE.md` — what this checkout is, the sibling-repo rules, the
   common craft-app rules.
2. `webos/src/os/registry.js` header — how apps are registered.
3. `docs/planning/webos-apps/ARCHITECTURE.md` — the architecture (its
   `## Module index` is machine-enforced; keep it in sync or CI fails).
4. `docs/planning/QUALITY-PROGRAM.md` — the quality program record: what
   was fixed, what was triaged, what is deliberately closed.
5. `docs/planning/HISTORY.md`, `SESSIONS.md`, `PROGRESS.md` — what shipped,
   what happened, where things stand.

## Ground rules (non-negotiable)

- **Gates before every commit**: from `webos/`, `npm run ci` = lint
  (zero warnings) → coverage (ratchet floors) → build. A red gate is a
  stop, not a note.
- **Ratchets only go up** (coverage floors, lint rules). Never lower one
  to make a change pass — fix the change.
- **No placeholders, stubs, or simulated data** in shipped code. Test
  doubles in tests are fine. Planning docs are where examples live.
- **WCAG 2.1 AAA** is enforced by tests (`tests/contrast-audit.test.js`,
  `tests/personas-theme.test.js`). New UI must clear the gates — run them.
- **CSR purity**: no server-side rendering, no compute on the render path.
  Static Pages + the existing thin proxy worker only.
- **No proprietary assets**; every asset needs provenance (see
  `docs/ATTRIBUTION.md`). Icons are drawn in code.
- **Commit discipline**: `<type>(<scope>): <subject>` ≤50 chars, body
  wrapped at 72, `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
  Start and end every session with a commit + push.
- **Version bumps are ×3**: `webos/package.json`, `webos/src/version.js`,
  `webos/public/sw.js` (`webos-vX.Y.Z`). A test enforces package.json ⇄
  version.js; production verification relies on the sw.js cache name.
- **Never commit**: fetched builds (`apps/`, `zips/`, `r2-blobs/` are
  gitignored), sibling repos (`cadcraft/` … `zed/`, `webos/public/BrowserInBrowser/`),
  or anything under `/nas/Temp/repos/FireCraft` (independent repo).
- **This shell gotcha**: cwd resets between Bash commands — re-anchor
  `cd /nas/Temp/repos/webos-deploy[...]/webos` every time; use
  `/usr/bin/grep` (plain `grep` misbehaves on some test files).

## Environment facts (verified 2026-10-13)

| Thing | Value |
|---|---|
| Repo | `/nas/Temp/repos/webos-deploy` → `github.com/aliasfoxkde/webos-deploy`, branch `main` |
| Shell source | `webos/` (Vite + React, CSR-only) |
| Production | https://artcraft-webos.pages.dev (`artcraft-webos` Pages project, branch `main`) |
| FireCraft checkout | `/nas/Temp/repos/FireCraft` (independent repo, M12, wasm target) |
| FireCraft production | https://firecraft-web.pages.dev (`firecraft-web` Pages project) |
| Deploy command | `npx wrangler pages deploy dist --project-name artcraft-webos --branch main` (from `webos/`) |
| CI | GitHub Actions `.github/workflows/ci.yml`; GitForge mirror `.gitforce.yml` |
| E2E tooling | `packaging/e2e/webos-sweep.mjs`, `packaging/e2e/firecraft-embed-probe.mjs` (env: `WEBOS_DIR`, `CHROME`, `SWEEP_SHOTS`, `SWEEP_PORT`, `FC_BASE_URL`) |
| Aegis scanner | `/home/mkinney/.local/bin/aegis` (`aegis scan <dir>`; the MCP scan endpoint is broken — use the CLI) |
| Test runner | `npx vitest run tests/<name>.test.js(x)` from `webos/`; `testTimeout` is 20 s — do not shrink it (coverage instrumentation breaks 5 s defaults) |

## The routine loop (apply to every change)

1. Work in `webos/` (or `docs/`, `packaging/`). Keep the Module index in
   sync if you add/remove files under `webos/src/` (test enforces).
2. `cd webos && npm run ci` — must be green.
3. If UI changed: `node packaging/e2e/webos-sweep.mjs` from the repo root
   (builds are already fresh from step 2) — expect `PASS (24/24 …, 0 errors)`
   and eyeball the new screenshots in `$SWEEP_SHOTS`.
4. Commit (conventions above) and push; watch Actions
   (`gh run watch $(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')`).
5. If the change is user-facing → release (phase H6 checklist), deploy,
   verify production (bundle hash ⇄ local dist, sw.js cache name).

## Phase H1 — operational hygiene (standing, per change)

- [ ] H1.1 Keep `PROGRESS.md` snapshot truthful (version, numbers, date).
- [ ] H1.2 Append a SESSIONS.md entry at session end (facts only).
- [ ] H1.3 After any src/ file add/remove: update the ARCHITECTURE.md
      Module index in the same commit (the test will fail otherwise).
- [ ] H1.4 After any registry change: run
      `npx vitest run tests/os-registry.test.js` plus the full gate; if a
      new icon ships, it must be original/code-drawn and noted in
      `docs/ATTRIBUTION.md`.
- [ ] H1.5 Keep releases one-per-user-facing-change; do not batch unrelated
      features into one version.

## Phase H2 — FireCraft deeper integration

The app is embedded and alive; the documented bridge
(`/nas/Temp/repos/FireCraft/docs/WEBOS.md`) is only used for liveness.
Each task is atomic and independently shippable; do them in order.

- [ ] H2.1 **Read the contract**: FireCraft `docs/WEBOS.md` — inbound
      `openDocument{bytes}` / `apply{name,payload}` / `exportPng` /
      `exportDocument` / `ping`; outbound replies all carry
      `source:'firecraft'`; host must validate `event.origin` against
      `https://firecraft-web.pages.dev`.
- [ ] H2.2 **Bridge plumbing in EmbedFrame**: extend the existing app
      bridge (`webos/src/os/bridge.js`, EmbedFrame wiring) with a
      request/reply correlate for firecraft-style apps (tag requests,
      resolve on matching `source` reply, timeout → honest error UI).
      Unit-test the correlate purely (no DOM), like the existing bridge
      tests.
- [ ] H2.3 **Autosave to the Files disk**: after each `applied` reply
      (debounced), `exportDocument` and persist the bytes via the existing
      virtual disk (`os/db.js`) under `/Apps/firecraft/autosave.fw.png`;
      on window open, if the file exists, `openDocument` it first. Gate
      behind a setting default-on; persist honest last-saved timestamps.
- [ ] H2.4 **Open-with from Files**: a `.fw.png` in the Files app gains
      "Open in FireCraft" (context menu) → launch with the file bytes via
      `openDocument`. Files already knows the disk APIs; reuse them.
- [ ] H2.5 **Export hand-off**: FireCraft `exportPng` → import into the
      Photos app (existing import path), and `exportDocument` → save into
      the Files disk at a user-chosen name via the existing save dialog.
- [ ] H2.6 **E2E proof**: extend `packaging/e2e/` with a probe that drives
      open→apply→exportDocument round-trip against the local build (mock
      bytes are FORBIDDEN — compose a real document via `apply`
      `object.createPath`, as FireCraft's own smoke does). Then release.

## Phase H3 — upstream adoption watch

- [ ] H3.1 When FireCraft ships an official app mark: replace
      `webos/public/icons/craft/firecraft.png` with the upstream 256 px
      resize, swap the ATTRIBUTION note for a proper sourced row (their
      `assets/app-icon/`), delete `packaging/icons-src/firecraft.svg`.
- [ ] H3.2 When FireCraft (or deck/sound/effect) publishes upstream
      release zips: add it to `packaging/fetch-apps.sh`'s list, migrate
      deployment to the fetched build, and update CLAUDE.md/PROGRESS.md —
      NEVER run fetch-apps.sh with `--force` while a checkout still lives
      in the target path (it `rm -rf`s).
- [ ] H3.3 Keep the registry `version` fields in sync with the deployed
      app versions (currently firecraft 0.1.0 per its Cargo.toml).

## Phase H4 — quality forward path

- [ ] H4.1 Branch coverage 88.78% is the farthest gate from target.
      Stretch goals: `src/shell/Settings.jsx` and `src/App.jsx` edge
      branches. Every bump of `vitest.config.js` floors must cite the
      measured numbers in a comment (established pattern).
- [ ] H4.2 Dependency refresh: `npm outdated` inside `webos/`, upgrade
      patch/minor first, run the full gate + sweep; pin only on evidence.
- [ ] H4.3 Aegis re-scan after any dependency or large feature change;
      triage into QUALITY-PROGRAM.md (dated section, established format).
- [ ] H4.4 Re-run `packaging/e2e/webos-sweep.mjs` after any shell-level
      feature; keep phase list in sync with new surfaces (add phases, do
      not delete evidence lines).

## Phase H5 — GitForge (operator-assisted)

- [ ] H5.1 Operator registers the pipeline with the deployed GitForge
      (`.gitforce.yml` is already validated; local validation record in
      QUALITY-PROGRAM.md and HISTORY.md).
- [ ] H5.2 After registration: trigger a run, capture the run id and job
      log, append the evidence to QUALITY-PROGRAM.md phase B.
- [ ] H5.3 Container revalidation procedure (no registration needed):
      `docker run --rm -v /nas/Temp/repos/webos-deploy:/src -w /src -e CI=true
      node:24-trixie-slim bash -c 'set -e; cd webos && npm ci && npm run lint
      && npx vitest run tests/contrast-audit.test.js tests/personas-theme.test.js
      && npm run coverage && npm run build'` — then
      `sudo chown -R mkinney:mkinney webos/{node_modules,coverage,dist}`
      afterwards (the container recreates them as root; host gates will
      EACCES otherwise). Prefer copying the repo to /var/tmp instead of
      mounting the NAS path when practical.

## Phase H6 — release checklist (next: 3.16.0)

1. [ ] Pick the version (user-facing change → minor; fix-only → patch).
2. [ ] Bump ×3 (`package.json`, `src/version.js`, `public/sw.js`).
3. [ ] `cd webos && npm run ci` — green (capture the numbers for the notes).
4. [ ] `node packaging/e2e/webos-sweep.mjs` — PASS, 0 page errors; skim
       screenshots for paint evidence of anything new.
5. [ ] Commit `chore(release): X.Y.Z`, push, `gh run watch` until green.
6. [ ] `gh release create vX.Y.Z --title … --notes-file …` — honest notes:
       what shipped, what was verified, changelog link.
7. [ ] `npx wrangler pages deploy dist --project-name artcraft-webos
       --branch main` from `webos/`.
8. [ ] Production verify: served `assets/index-*.js` hash equals local
       `dist/index.html`'s; `curl …/sw.js` shows the new cache name; any
       new surface spot-checked in real Chromium (`FC_BASE_URL`-style
       probe or the sweep's `SWEEP_PORT` against a preview of prod is not
       possible — use the probe pattern with the prod URL).
9. [ ] Update PROGRESS.md snapshot + HISTORY.md rows + SESSIONS.md entry;
       final commit + push.

## Known pitfalls (all encountered for real)

| Pitfall | Handling |
|---|---|
| `npm ci` in a container on the NAS mount → root-owned `node_modules/`, `coverage/`, `dist/`; host vitest then EACCES on `.vite-temp` | `sudo chown -R mkinney:mkinney webos/{node_modules,coverage,dist}`; or copy the tree to /var/tmp for container runs |
| `wrangler pages deploy` does not auto-create projects non-interactively (API 404, code 8000007) | `wrangler pages project create <name> --production-branch main` first |
| Istanbul/V8 line attribution: conditional-JSX lines count arrow INVOCATIONS, not element creations; `Panels.jsx` `catch{}` block is a proven blind spot | Cover by clicking (invoking arrows); accept the 4 settled uncovered lines; never "fix" by refactoring to ternaries (changes nothing) |
| Coverage run flakes at 5 s wall-clock defaults under instrumentation | `testTimeout: 20_000` is set; keep it |
| Plain `grep` misreads some test files as binary; cwd resets between commands | `/usr/bin/grep`; re-anchor `cd` every command |
| Pages 25 MiB per-asset cap | FireCraft's 10.9 MB wasm is fine; larger blobs go the R2 `craftweb` route (see packaging/) |
| `screen.getByText('New folder')`-style ambiguity (toolbar vs ctx menu) | Scope queries (`.ctx-item`), clear DOM in `beforeEach` |
| OSProvider is a named export; `parent`/`base` are MemFS methods | Import `{ OSProvider }`; call on an `fs` instance |
| WebOS preview server binds `[::1]` only for some commands | Prefer `vite preview --host 127.0.0.1` as the e2e scripts do |

## Do NOT (each has a reason)

- Do not chase the 4 uncovered lines (unreachable / V8 quirk — proven).
- Do not add `firecraft` to `packaging/fetch-apps.sh` (no upstream zips;
  `--force` would delete its checkout if paths ever collide).
- Do not commit sibling repos' contents or fetched builds.
- Do not introduce SSR, a Node server, or any render-path compute.
- Do not lower coverage floors, lint strictness, WCAG gates, or
  `testTimeout` to make something pass.
- Do not use `git stash` / `git push --force` / `rm -rf` (house rules:
  branches, no force-push, `find <path> -depth -delete` after an
  enumerated manifest for cleanup).

## Evidence map

| Claim | Where to look |
|---|---|
| Quality program record + triage | `docs/planning/QUALITY-PROGRAM.md` |
| What shipped per release | `gh release list`; `docs/planning/HISTORY.md` |
| Session-by-session work | `docs/planning/SESSIONS.md` |
| Live status | `docs/planning/PROGRESS.md` |
| E2E proof | `packaging/e2e/*.mjs` run output + `$SWEEP_SHOTS` screenshots |
| CI green | `gh run list` (Actions); GitForge container record in QUALITY-PROGRAM.md |
| Production truth | `curl https://artcraft-webos.pages.dev/sw.js`; served bundle hash ⇄ local `webos/dist/index.html` |
