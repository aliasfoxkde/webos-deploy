# AGENTS.md — working rules for AI agents in this repo

This is **ArtCraft WebOS** (`github.com/aliasfoxkde/ArtCraft-WebOS`): a Vite + React browser
desktop (`webos/`) that hosts 13 registered external Craft apps and 13 bundled first-party plugins, plus the
packaging that fetches their release builds (`packaging/fetch-apps.sh`) and
deploys them (`wrangler pages deploy`). Humans start at `README.md`; agents
start here.

## Read order (cold start)

1. `README.md` — what the product is, where the live app is.
2. `CLAUDE.md` (root) — repository layout and Craft sibling-repo rules.
3. `docs/planning/MVP-EXECUTION-PLAN.md` — active near-term product target,
   acceptance matrix, sequencing and WIP limits.
4. `docs/planning/HANDOFF.md` — continuation context and validation rules.
5. `docs/planning/PROGRESS.md` — live status board; update with verified
   evidence, not optimistic status labels.
6. `docs/planning/PLATFORM-ARCHITECTURE-ROADMAP.md` — long-term SDK,
   app/game package, AI-control and native/ISO/ROM direction.
7. `docs/planning/webos-apps/ARCHITECTURE.md` — architecture; its
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
- `docs/planning/` — active authority: MVP-EXECUTION-PLAN, HANDOFF and
  PROGRESS; long-term authority: product-vision and
  PLATFORM-ARCHITECTURE-ROADMAP; evidence/history: SESSIONS, HISTORY and
  the dated QUALITY-PROGRAM. PHASES and OSS-READINESS-PLAN are historical
  records, not active backlogs. Update PROGRESS and SESSIONS at the end
  of a real work session.
- Agent scratch folders — `docs/history/` (release/milestone snapshots),
  `docs/research/` (investigation notes), `docs/memory/` (durable gotchas
  and decisions), `docs/tasks/` (ad-hoc task notes; delete or graduate
  when done). Keep scratch out of `docs/planning/` — that directory is
  the curated record. Nothing in these folders may hold secrets or
  credentials.

## Session protocol

1. Cold start per the read order; check current main, open PRs/issues and
   the current branch/HEAD before trusting snapshots.
2. Take one scoped issue with a user outcome, acceptance tests, file
   ownership and integration point. Prefer vertical slices; keep parallel
   agents on disjoint files and no more than two active implementation
   workstreams before the productivity MVP.
3. Run targeted tests during iteration, then the relevant full quality and
   browser E2E gates at integration/release points.
4. End of session: update `PROGRESS.md`, append `SESSIONS.md`, and update
   the MVP plan only when scope/priority actually changes. For user-facing
   releases follow [the checklist](development/release.md).
4. If you learn a durable gotcha, record it: a pitfall row in HANDOFF.md
   (build/CI), or a note in `memory/`.
