# Contributing to ArtCraft WebOS

Thanks for your interest. This repository holds the **WebOS shell** (a
Vite + React browser desktop in [`webos/`](webos/)) and the release
tooling that packages twelve embedded ArtCraft craft apps. The craft apps
themselves live in separate repositories (`github.com/aliasfoxkde/<app>`)
— contributions to those belong in their repos.

## Getting started

1. Read the [architecture overview](docs/architecture/overview.md) and
   [development setup](docs/development/setup.md).
2. `cd webos && npm install && npm run dev`
3. Pick an issue (or open one first for anything non-trivial).

## The gates (non-negotiable)

Before every commit, from `webos/`:

```bash
npm run ci    # lint (zero warnings) → coverage (ratchet floors) → build
```

- **Coverage ratchets only go up.** Never lower a floor to make a change
  pass — fix the change.
- **Accessibility is a gate**: WCAG 2.1 AAA contrast is enforced by
  `tests/contrast-audit.test.js`, including against the flattening
  wallpapers. New colors/tokens must pass it.
- **Docs are gated**: every backticked repo path in root docs must exist,
  and `docs/planning/webos-apps/ARCHITECTURE.md`'s Module index must name
  every file under `webos/src/`. Keep them in sync or CI fails.
- Fixes ship with a regression test naming the failure they prevent.

## Conventions

- Commit messages: `<type>(<scope>): <subject>` — feat/fix/docs/refactor/
  test/chore; imperative subject ≤ 50 chars.
- No placeholder code, no versioned files (`*_v2.*`), no backup files.
- Shell scripts in `packaging/` are shellchecked in CI.
- Never hand-edit `apps/`, `zips/`, or `r2-blobs/` — those are fetched
  release artifacts (gitignored).

## Pull requests

- One logical change per PR; user-facing changes ship as their own
  release (maintainers handle the release checklist in
  [docs/development/release.md](docs/development/release.md)).
- CI must be fully green; a maintainer review is required for merge.
- Describe what changed, why, and how you verified it (include the
  coverage/test numbers if the gates were touched).

## Issues

Use the templates. For security issues, use
[private vulnerability reporting](SECURITY.md) — never public issues for
exploit details.

## Licensing

By contributing you agree your work is released under this repository's
[MIT license](LICENSE). Any third-party asset must be properly licensed
and get a row in [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md) — no
proprietary assets, ever.
