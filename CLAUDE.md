# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this directory is

A checkout area holding 8 sibling **ArtCraft "craft" apps** — clean-room, pure-Rust reimaginations of classic creative/productivity applications, each targeting 1:1 parity with its reference app plus better speed, openness, and agent control. This directory exists for **web (WASM) deployment**: every app builds to the browser via trunk.

**This directory is ALSO a git repo itself** (`github.com/aliasfoxkde/webos-deploy`): it contains **ArtCraft WebOS** — a Vite + React browser desktop that hosts the craft apps — plus the packaging that fetches and deploys their release builds. See `README.md` for the layout (`webos/` shell source, `packaging/fetch-apps.sh` release sync, `apps/` + `zips/` + `r2-blobs/` are gitignored build artifacts). The sibling source repos (`cadcraft/` … `zed/`) are independent git repositories and are **gitignored here** — never commit their contents to this repo.

**The craft sibling dirs are not a Cargo workspace.** Each is an independent git repository (branch `main`, remote `github.com/aliasfoxkde/<app>`) with its own version, history, and agent instructions. There is no cross-repo build; never run cargo from this parent level. Repositories don't share code — they share conventions only (the shared standards live in the separate, non-public `storytold/craftrules` repo, which is **not** checked out anywhere under here — don't look for it locally).

**WebOS work happens in `webos/`** (Vite + React, no Rust): plugin apps live in `webos/src/apps/<name>/`, the registry in `webos/src/os/registry.js`, architecture in `docs/planning/webos-apps/ARCHITECTURE.md`. Deploy with `wrangler pages deploy webos/dist --project-name artcraft-webos` after `npm run build`. Craft releases come from the `storytold/<app>` GitHub org (asset `{app}-web-<version>.zip`) — fetch with `packaging/fetch-apps.sh`, never commit fetched builds.

| Directory | App | Parity target | Version |
|---|---|---|---|
| `cadcraft/` | CADCraft | AutoCAD | 0.3.0 |
| `designcraft/` | DesignCraft | InDesign | 0.4.0 |
| `gridcraft/` | GridCraft | Excel | 0.3.0 |
| `lightcraft/` | LightCraft | Lightroom | 0.4.0 |
| `pdfcraft/` | PdfCraft | Acrobat | 0.4.0 |
| `photocraft/` | PhotoCraft | Photoshop | 0.5.0 |
| `vectorcraft/` | VectorCraft | Illustrator | 0.7.0 |
| `wordcraft/` | WordCraft | Word | 0.3.0 |
| `apps/deckcraft/` | DeckCraft | PowerPoint | 0.4.0 |

DeckCraft's checkout lives at `apps/deckcraft/` (inside the gitignored apps/ dir, not a sibling) and its web build is deployed from that checkout to `deckcraft-web.pages.dev` — it has no upstream release zip yet, so it is NOT in `packaging/fetch-apps.sh`'s list (`--force` would `rm -rf` the checkout). (`filmcraft`, `effectcraft` are referenced in docs as siblings but are not checked out here. Docs reference `storytold/<app>` repos; the actual remotes use the `aliasfoxkde` org.)

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
