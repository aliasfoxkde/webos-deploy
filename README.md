# ArtCraft WebOS

A browser desktop environment — window manager, taskbar, start menu, app
store, settings — hosting twelve embedded **ArtCraft** craft apps:
clean-room, pure-Rust reimaginations of classic creative software,
compiled to WebAssembly.

| | |
|---|---|
| | **▶ [Launch ArtCraft WebOS](https://artcraft-webos.pages.dev)** — free, no account, runs entirely in your browser. A full desktop in a tab: terminal, code editor, files, browser, plus CADCraft (AutoCAD), PhotoCraft (Photoshop), VectorCraft (Illustrator), GridCraft (Excel), WordCraft (Word), DeckCraft (PowerPoint), SoundCraft (Pro Tools), EffectCraft (After Effects), LightCraft (Lightroom), DesignCraft (InDesign), PdfCraft (Acrobat), and FireCraft. Your desktop, files, and settings persist locally. |

![ArtCraft WebOS desktop](docs/screenshot-desktop.png)

*The WebOS desktop — start menu, taskbar, widgets, and embedded craft-app
windows.*

## Status

[![CI](https://github.com/aliasfoxkde/webos-deploy/actions/workflows/ci.yml/badge.svg)](https://github.com/aliasfoxkde/webos-deploy/actions/workflows/ci.yml)
License: MIT · ~1400 specs, 99%+ coverage (ratcheted), WCAG 2.1 AAA
contrast gates, 27-phase e2e sweep in CI.

## Documentation

Everything lives in [`docs/`](docs/README.md), layered so you can dig as
deep as you need without scrolling a wall of text:

| I want to… | Start here |
|---|---|
| Use the desktop | [Quickstart](docs/getting-started/quickstart.md) · [The craft apps](docs/getting-started/apps.md) |
| Understand the system | [Architecture overview](docs/architecture/overview.md) · [Browser & proxy](docs/architecture/browser.md) · [Bridge protocol](docs/architecture/bridge.md) |
| Develop / contribute | [Setup](docs/development/setup.md) · [Quality gates](docs/development/quality.md) · [Contributing](.github/CONTRIBUTING.md) · [Agent rules](docs/AGENTS.md) |
| Ship a release | [Packaging & release](docs/development/release.md) · [Craft app registry](docs/reference/craft-apps.md) |
| Follow the project | [Planning & status](docs/planning/PROGRESS.md) · [Handoff](docs/planning/HANDOFF.md) · [Attribution](docs/ATTRIBUTION.md) |

## Repository layout

```
webos/        the WebOS shell (Vite + React, no Rust) — all source here
packaging/    release tooling: fetch craft-app builds, deploy, e2e sweep
apps/         fetched craft-app builds (gitignored, never committed)
docs/         documentation + planning + agent workspace (see docs/README.md)
cadcraft/ …   sibling craft-app source repos — independent git repos,
wordcraft/    gitignored here, never committed
```

## The craft apps

Each embedded app is also a standalone site at `<name>-web.pages.dev`,
built from its own repository under `github.com/aliasfoxkde/<app>` and
synced into this repo via `packaging/fetch-apps.sh` — versions and routes
in [docs/reference/craft-apps.md](docs/reference/craft-apps.md).

## Contributing & community

- [Contributing](.github/CONTRIBUTING.md) — gates, conventions, PR process
- [Code of Conduct](.github/CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md) — private vulnerability reporting enabled
- [Support](.github/SUPPORT.md) · [Funding](.github/FUNDING.yml)

## License

[MIT](LICENSE) for this repo's shell and tooling. Each craft app carries
its own `LICENSE.txt` (Apache-2.0 OR MIT). Third-party assets are
catalogued in [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md).
