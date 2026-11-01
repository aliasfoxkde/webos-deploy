# Development Setup

## Prerequisites

- Node.js (see `webos/package.json` engines / CI version)
- A checkout of this repo. The `cadcraft/`…`wordcraft/` sibling
  directories are **separate git repos** (gitignored here) — you do not
  need them to work on the WebOS shell.

## Run

Clone the public repository, then install the locked WebOS dependencies:

```bash
git clone https://github.com/aliasfoxkde/ArtCraft-WebOS.git
cd ArtCraft-WebOS
cd webos
npm ci
npm run dev        # Vite dev server on 127.0.0.1
```

## Gates (run before every commit)

```bash
npm run ci         # lint → coverage (ratchet floors) → build
```

- `npm run lint` — ESLint, **zero warnings** allowed.
- `npm run coverage` — vitest + coverage ratchets in `webos/vitest.config.js`;
  floors only move up. Includes the WCAG AAA contrast audit.
- `npm run build` — production bundle.

## E2E sweep

`packaging/e2e/webos-sweep.mjs` drives a real Chrome through 27 phases and
saves screenshots (default `/var/tmp/sweep-shots`, override
`SWEEP_SHOTS`). CI runs it on every push.

## Deploy (maintainers)

```bash
cd webos && npm run build
wrangler pages deploy dist --project-name artcraft-webos
```

See [release.md](release.md) for the full checklist.

## Gotchas

- Never edit files under `apps/`, `zips/`, or `r2-blobs/` — they are
  fetched artifacts, gitignored.
- The sibling craft checkouts are independent repos; never run cargo from
  this repo's root, and never commit their contents here.
- Shell gotcha: `mv`/`cp` may be aliased interactive — use `/bin/mv -f`.
