# Documentation — ArtCraft WebOS

Start here. Docs are layered: overview first, deep detail one click down.
Nothing in this file requires scrolling past an index.

## For users

| Page | What it covers |
|---|---|
| [Quickstart](getting-started/quickstart.md) | Open the app, launch apps, keyboard basics |
| [The craft apps](getting-started/apps.md) | The twelve bundled ArtCraft apps and how embedding works |
| [Browser](architecture/browser.md) | What the bundled browser can and cannot load, and why |

## For developers

| Page | What it covers |
|---|---|
| [Architecture overview](architecture/overview.md) | Plugin system, OS core, shell — with pointers into the full module index |
| [Bridge protocol](architecture/bridge.md) | Dev-driver / automation bridge (`webos/src/os/bridge.js`) |
| [Development setup](development/setup.md) | Clone, install, run, test |
| [Quality gates](development/quality.md) | Lint, coverage ratchets, WCAG AAA, docs gates, CI |
| [Packaging & release](development/release.md) | Fetching craft-app builds, Cloudflare Pages deploy, release checklist |
| [Contributing](../CONTRIBUTING.md) | How to propose changes; community docs in [.github/](../.github) |

## Reference

| Page | What it covers |
|---|---|
| [Craft app registry](reference/craft-apps.md) | Versions, sources, deploy routes for all twelve apps |
| [Attribution](ATTRIBUTION.md) | Every third-party asset and its license |
| [Liquid Glass design](planning/webos-apps/LIQUID-GLASS.md) | Design-language research + phased plan |

## Planning & agent workspace

- [Product vision and roadmap](planning/product-vision.md) — current scope,
  explicit gaps, and staged path toward a user-owned desktop environment.
- [Platform architecture roadmap](planning/PLATFORM-ARCHITECTURE-ROADMAP.md) — shared libraries/components, app and game packages, CLI/MCP/AI control, and browser-to-native/ISO/ROM direction.
- [planning/](planning/) — plan of record: [HANDOFF.md](planning/HANDOFF.md)
  (continuation context), [PROGRESS.md](planning/PROGRESS.md) (status board),
  [PHASES.md](planning/PHASES.md) (work plan), [SESSIONS.md](planning/SESSIONS.md),
  [HISTORY.md](planning/HISTORY.md), [QUALITY-PROGRAM.md](planning/QUALITY-PROGRAM.md),
  and [webos-apps/](planning/webos-apps/) design docs.
- [history/](history/) — release history snapshots and milestone records.
- [research/](research/) — investigation notes and findings before they become plans.
- [memory/](memory/) — durable agent notes (gotchas, decisions, environment facts).
- [tasks/](tasks/) — small ad-hoc task scratch; finished tasks graduate into
  planning docs or are deleted.

Agents: read [AGENTS.md](../AGENTS.md) at the repo root before writing here.
