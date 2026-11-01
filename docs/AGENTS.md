# AGENTS.md — working rules for AI agents in this repo

This is **ArtCraft WebOS** (`github.com/aliasfoxkde/ArtCraft-WebOS`): a Vite + React browser
desktop (`webos/`) that hosts twelve embedded ArtCraft craft apps, plus the
packaging that fetches their release builds (`packaging/fetch-apps.sh`) and
deploys them (`wrangler pages deploy`). Humans start at `README.md`; agents
start here.

## Read order (cold start)

1. `README.md` — what the product is, where the live app is.
2. `CLAUDE.md` (root) — checkout layout, sibling-repo rules, craft-app
   common rules.
3. `docs/planning/HANDOFF.md` — **continuation context**. Read top to
   bottom before touching anything.
4. `docs/planning/PROGRESS.md` — live status board; update its snapshot
   when you change anything.
5. `docs/planning/webos-apps/ARCHITECTURE.md` — architecture; its
   `## Module index` is enforced against `webos/src/` by
   `webos/tests/docs-coverage.test.js`.

## Non-negotiable gates

- `cd webos && npm run ci` (lint zero-warnings → coverage ratchets →
  build) is green **before every commit**. A red gate is a stop.
- Ratchets (coverage floors, lint rules) **only go up**. Never lower one
  to pass; fix the change.
- Docs gates: every backticked repo path in `README.md`, `CLAUDE.md`,
  `docs/**/*.md` must exist (`tests/docs-references.test.js`);
  ARCHITECTURE.md's Module index must list every file under `webos/src/`.
- Regression tests accompany fixes. Honest release notes. No placeholder
  code, no versioned files (`*_v2.*`), no backup files.

## Layout boundaries

- `webos/` — the only source you will normally edit (plus docs).
- `apps/`, `zips/`, `r2-blobs/` — fetched artifacts, **gitignored, never
  hand-edited or committed**.
- `cadcraft/` … `wordcraft/`, and craft checkouts elsewhere on disk —
  **independent git repos**, gitignored here. Never commit their contents
  to this repo; never run cargo from this repo's root.
- `packaging/` — release tooling (shell scripts, shellchecked in CI).

## Docs organization

Topic docs live in `docs/` (see `docs/README.md` for the index):

- `docs/getting-started/`, `docs/architecture/`, `docs/development/`,
  `docs/reference/` — curated, tested-by-gate documentation.
- `docs/planning/` — plan of record (HANDOFF, PROGRESS, PHASES, SESSIONS,
  HISTORY, QUALITY-PROGRAM, webos-apps/ design docs). Update these at the
  end of every session.
- Agent scratch folders — `docs/history/` (release/milestone snapshots),
  `docs/research/` (investigation notes), `docs/memory/` (durable gotchas
  and decisions), `docs/tasks/` (ad-hoc task notes; delete or graduate
  when done). Keep scratch out of `docs/planning/` — that directory is
  the curated record. Nothing in these folders may hold secrets or
  credentials.

## Session protocol

1. Cold start per the read order; check `git log` for movement past the
   docs' snapshot dates.
2. Work in small, verified steps; run the gates.
3. End of session: update `PROGRESS.md`, append `SESSIONS.md`, and if
   user-facing, ship a release per
   [the checklist](development/release.md).
4. If you learn a durable gotcha, record it: a pitfall row in HANDOFF.md
   (build/CI), or a note in `memory/`.
