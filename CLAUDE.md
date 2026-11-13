# CLAUDE.md

This file provides guidance to coding agents working in this repository.

## What this repository is

This repository is **ArtCraft WebOS**: a Vite + React browser desktop, its
first-party apps, release/deployment tooling, and documentation. It is not
a Cargo workspace and is not a source monorepo for the independently
developed Craft applications.

- `webos/` contains the browser/PWA shell and 13 bundled first-party plugins.
- `webos/src/os/registry.js` registers external Craft apps and hosted web apps.
  The current external Craft catalogue has 13 apps; see
  [docs/reference/craft-apps.md](docs/reference/craft-apps.md) and
  [docs/getting-started/apps.md](docs/getting-started/apps.md).
- `packaging/` contains app-release fetch, deploy, security and E2E tooling.
- `apps/`, `zips/` and `r2-blobs/` are fetched/release artifacts and are
  gitignored. Never hand-edit or commit generated app bundles.
- Craft source repositories are independently versioned and maintained.
  They may exist as optional sibling checkouts in a maintainer's workspace,
  but they are not required to clone, build or work on the WebOS shell and
  must never be committed into this repository.

Do not use a machine-specific path (for example a maintainer's NAS checkout)
as an application integration contract. Use canonical repository names,
release assets, registry rows and documented public interfaces.

## Active product objective

The near-term target is a **dependable local-first productivity beta** for
real users in the browser/PWA. Its active scope, user-workflow acceptance
matrix, backup/restore contract, work sequencing, WIP limits, token/task
receipts and infrastructure measurement method are in
[docs/planning/MVP-EXECUTION-PLAN.md](docs/planning/MVP-EXECUTION-PLAN.md),
tracked by [issue #37](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/37).

The immediate P0 work is user-visible backup/export and validated restore,
followed by end-to-end Files, Notepad, Editor and supported Craft-app
handoff workflows. Native host, ISO/Btrfs, device ROM, arbitrary WASM,
identity/sync, general-purpose AI agents and the broad SDK are long-term
tracks; do not make them prerequisites for the browser MVP.

The published Chat app currently has no configured production model
adapter. Do not describe the no-model/echo adapter as a working assistant.
The same-origin remote HTML proxy was removed; do not reintroduce it or
serve untrusted remote HTML under the WebOS origin.

## Development and quality gates

WebOS application work happens in `webos/` (Vite + React; no Rust):

```bash
cd webos
npm ci
npm run ci       # strict lint, coverage floors, production build
npm run sweep    # production build + headless Chrome E2E sweep
```

Run targeted tests while iterating, then the relevant full gate and browser
sweep at integration/release points. Never lower coverage, lint, security or
accessibility gates to make a change pass. Do not repeatedly run the full
build from multiple agents against the same unchanged tree.

The repository workflows are in `.github/workflows/`; verify the actual
required jobs on the exact candidate commit. A green run on an earlier SHA
or another branch is not a release receipt.

## Release artifact and data rules

- Fetch external Craft app releases through `packaging/fetch-apps.sh`.
  Do not hand-edit downloaded assets or commit fetched builds.
- Registry versions, release asset hashes and WASM hashes must agree;
  `webos/tests/registry-versions.test.js` enforces the deployed set.
- PWA/local data lives in browser-managed storage. IndexedDB/localStorage
  persistence is not a backup. Do not claim complete export/restore, cloud
  sync, E2EE, a native filesystem or arbitrary WASM sandbox unless the
  corresponding feature and tests exist.
- Keep third-party apps isolated through the documented host bridge;
  validate origin and source window, namespace storage, and do not grant
  capabilities based only on an app's presence in the registry.
- After a release, verify the deployed bundle hashes and service-worker
  cache stamp against the exact release SHA.

## Source-of-truth docs

- Active MVP: [MVP-EXECUTION-PLAN.md](docs/planning/MVP-EXECUTION-PLAN.md)
- Current status: [PROGRESS.md](docs/planning/PROGRESS.md)
- Continuation and operating rules: [HANDOFF.md](docs/planning/HANDOFF.md)
- Long-term vision: [product-vision.md](docs/planning/product-vision.md)
- Long-term platform architecture: [PLATFORM-ARCHITECTURE-ROADMAP.md](docs/planning/PLATFORM-ARCHITECTURE-ROADMAP.md)
- Current docs index: [docs/README.md](docs/README.md)

## Read the per-repo agent doc first

Before working in any app, read that repo's `CLAUDE.md` (`photocraft/` uses `AGENTS.md` — it is the equivalent). Those files are **authoritative** and carry the deep, per-app detail: crate layering tables, command registries, clean-room boundaries specific to the parity target, MCP/control-channel protocol, and roadmap/parity status. This file only covers what's common and what's specific to this checkout.

Rules that hold in every repo (enforced by each repo's `xtask` and clippy config):

- **Never crash** — the top rule, outranking feature work. No `unwrap()`/`expect()`/`panic!`/`unreachable!`/`todo!`/`unimplemented!` in non-test code, no `unsafe` (`unsafe_code = "forbid"`); errors flow through `Result`. Input-derived values (files, command params, control/MCP JSON) are hostile. Crash fixes land with regression tests.
- **Clean-room** — the parity app may be *observed* black-box only; never read/disassemble/copy anything from its bundle, and never copy GPL/LGPL/AGPL code from competing open-source implementations. File formats come from public specifications only.
- **No proprietary assets, ever** — every icon/image/font/pattern is drawn in code, public domain/CC0, or properly licensed, and **must have a row in `ATTRIBUTION.md`** (`cargo xtask assets` enforces it). Fonts live in the separate `craft-fonts` repo, wired in only via the optional `CRAFT_FONTS_DIR` build input; code must work without it. This is the most serious rule in every repo.
- **Everything is a command** — user-visible behaviour is a `CommandSpec` in the engine crate; UI, CLI, control channel, and MCP all dispatch the same commands. Programmatic calls never open dialogs.
- **Layered crates** — L0 (geom/doc models) → … → L5/L6 (`ui-egui`); nothing below the UI layer depends on egui/eframe/winit/rfd. Enforced by `cargo xtask layers`. The UI crate is swappable.
- **Rust only** — no handwritten JS/TS anywhere; never break wasm (`cargo xtask wasm`).

## Commands (run inside a repo, not from this parent)

All repos use the same shape; substitute the app name.

```bash
cd cadcraft/

cargo xtask ci                 # full gate before every commit: fmt, clippy -D warnings,
                               #   tests, assets, layers, wasm
cargo xtask layers             # dependency-layer check alone
cargo xtask wasm               # wasm build check alone
cargo xtask parity             # recompute docs/parity.md from the command catalog
cargo xtask version            # print/bump [workspace.package] version (single source of truth)

cargo run --release -p cadcraft -- --sample --control 7979   # GUI app + JSON control channel
cargo test -p cadcraft-engine                               # one crate
cargo test -p cadcraft-engine hostile                       # tests matching a substring

# web (browser) build — this is what this checkout is for
cd apps/cadcraft-web && trunk serve            # dev server (Trunk.toml: 127.0.0.1:8771)
trunk build --release                          # output → ../../dist/web (public_url = "./")

# package the web build into a deployable zip
cd ../.. && packaging/web/package.sh           # → dist/cadcraft-web-<version>.zip
```

- The **control channel** is JSON lines on `127.0.0.1:<port>` (each app documents its port in the 79xx range; or pass any free port). `{"id":1,"method":"engine.execute",...}` drives commands, `ui.screenshot` captures a PNG — use it to *look at* UI work. Protocol: `docs/control-protocol.md`.
- `packaging/web/package.sh` builds (or `--skip-build`) and zips the static site; it fails if `index.html` contains root-absolute URLs (the site must work from any sub-path and inside an iframe). `_headers` and `.htaccess` ship as hosting samples; hosting notes in `packaging/web/README.md`.
- CLI binaries (`apps/<app>-cli`) run headless: script/command execution, format conversion, `mcp` subcommand.
- Shell gotcha: `mv`/`cp` may be aliased interactive — use `/bin/mv -f` / `/bin/cp -f`.

## Gotchas specific to this checkout

- **No `plan/` directories.** Each repo's agent doc says to start from `plan/STATUS.md` etc., but `plan/` is gitignored and absent here. Fall back to `ROADMAP.md` and `docs/parity.md` (wordcraft's doc documents this fallback explicitly).
- **Parallel agents**: give each agent its own `CARGO_TARGET_DIR`, edit only the crates you own, and delete your target dir when done — this is a NAS; disk and spin-up cost are real.
- Product naming in user-facing text is `{Function}Craft` PascalCase (PhotoCraft, GridCraft…); machine names (crates, binaries, ids, dirs) are lowercase.
