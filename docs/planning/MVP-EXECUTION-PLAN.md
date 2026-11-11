# ArtCraft WebOS — Productivity MVP Execution Plan

> **Status:** active delivery plan, reviewed 2026-11-10.  
> **Near-term milestone:** dependable local-first productivity beta for real users.  
> **Tracking:** [GitHub issue #37](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/37).  
> **Long-term direction:** [Product vision](product-vision.md) and [platform architecture roadmap](PLATFORM-ARCHITECTURE-ROADMAP.md).  
> **Current status board:** [PROGRESS.md](PROGRESS.md). This file is the product execution authority; the status board records evidence, not another roadmap.

This plan deliberately separates the product people can use soon from the larger operating-system architecture. We are not reducing the long-term vision. We are putting a working, supportable product in users' hands before expanding into more platform layers.

## 1. Product decision

**ArtCraft WebOS MVP is a browser-first, installable, local-first productivity desktop.** It combines a desktop shell, a dependable Files workspace, a curated set of bundled utilities, and the ArtCraft creative/productivity application catalogue.

The MVP should let a user do useful work from a normal supported browser or PWA, with no mandatory account, cloud service, native installation, or configured AI provider. It must make local-data limitations visible and provide a tested way to export and restore WebOS-managed data.

The MVP is not a Linux distribution, a full Chromium browser, a universal WASM runtime, or a finished AI agent operating system. Those are separate future programs with separate security and release gates.

### User promise

A user can:

1. Open the WebOS desktop and understand what runs locally, what is an external app, and what requires the network.
2. Create, edit, organize, import, and export ordinary work files with the bundled Files, Notepad, and Editor applications.
3. Launch the relevant document, spreadsheet, presentation, PDF, graphics, and media apps from the curated Craft catalogue.
4. Close and reopen the desktop without ordinary app-window closure losing saved work.
5. Export a versioned backup of supported WebOS-managed data, restore it into a clean profile, and verify that the restored content is intact.
6. Work locally without signing in or configuring an AI provider.
7. Navigate the core experience by keyboard and at supported mobile/tablet sizes, with clear error and recovery behavior.

A workflow is considered supported only when it has been tested end-to-end on the released build, including its persistence and recovery behavior.

## 2. Verified baseline (2026-11-10 audit)

The latest canonical `main` commit is `5b4fe552428f2fc02e7887897ceeb1744edb8fec`, committed 2026-11-03. The latest published release is [v3.25.0](https://github.com/aliasfoxkde/ArtCraft-WebOS/releases/tag/v3.25.0), published 2026-11-03. The latest full GitHub CI run on that main SHA passed on 2026-11-03; scheduled CodeQL on 2026-11-09 also passed. These are the latest verified receipts, not a claim that the current work branches have passed.

| Area | Verified state | Product implication |
|---|---|---|
| Desktop shell | Browser-based React/Vite shell with windows, taskbar, launcher, settings, personas and app store | A usable desktop foundation exists |
| First-party apps | 13 bundled plugins: Browser, Calculator, Chat, Editor, Files, Notepad, Photos, Task Manager, Terminal, Video, Weather, Snippet, Cast | Keep the working app surface; prioritize coherent user workflows |
| External Craft apps | 13 registered apps, including FireCraft and SolidCraft | The catalogue is already broad; app count is not the current bottleneck |
| Local storage | IndexedDB virtual Files disk; settings and some app state in browser storage/localStorage | Data remains tied to the browser origin/profile |
| Files bridge | Origin- and source-window-checked per-app storage namespace `/Apps/<appId>/` | A real integration seam exists, but the full user data lifecycle needs validation |
| Notes / Editor | Local autosave; Files export/import paths | Useful primitives, but their state and backup boundaries must be explicit |
| AI Chat | The shipped adapter is intentionally `No model configured`; the default adapter is an echo/status explanation, not a real model | Do not market AI Chat as an available assistant |
| Browser | Normal browser tab/iframe behavior; same-origin remote HTML proxy was removed and issue #12 closed | Be honest about frame restrictions and external-browser handoff |
| Backup/restore | User-visible backup/restore remains open in issue #17 | **P0 MVP data-safety gap** |
| Identity / sync | Not implemented as a complete user-facing service | No cloud-sync promises |
| Native OS | Not implemented in this repository | Not an MVP dependency |
| Test/quality baseline | Last recorded baseline: 1,475 specs / 95 files; 98.88% statements, 94.86% branches, 98.95% functions, 99.91% lines; existing floors remain enforced | Preserve the quality floor; stop treating higher coverage percentages as the product roadmap |

The current canonical code includes 13 bundled plugins and 13 external Craft app registrations. Do not confuse those two catalogues or repeat the old twelve-app count in documentation.

## 3. MVP scope and explicit exclusions

### Included

- Browser desktop and installable PWA behavior on a documented browser matrix.
- Local-first Files workspace and supported per-app storage bridge.
- Notepad and Editor core workflows, including import/export to the Files store.
- A curated app catalogue, launch/open-with behavior, and accurate external-app handoff.
- Backup/export and validated restore/import for WebOS-managed data.
- Data migration/versioning, quota/error handling, and user-facing recovery guidance.
- Essential onboarding/help, keyboard access, mobile layout, and accessibility for supported core workflows.
- CI, browser E2E, release metadata, production deployment verification, and a pilot support/feedback path.

### Explicitly not required to ship the first productivity beta

- Bootable ISO, Linux installer, native system services, Btrfs snapshots/rollback, hardware support matrix, or device ROM.
- Arbitrary user-uploaded WASM/WASI modules or native executable installation.
- Mandatory identity, cloud sync, remote account recovery, or end-to-end encryption claims.
- An embedded full Chromium engine or a proxy that executes third-party HTML with the WebOS origin.
- A complete AI agent, general-purpose MCP server, autonomous app authoring, or self-modifying shell.
- A new universal design system, monorepo, umbrella SDK, or broad rewrite of the Craft app family.

Those remain separate roadmap tracks. Work on them may proceed only when it does not pull the MVP's accountable owner or release path away from the P0 acceptance work.

## 4. User-workflow acceptance matrix

The following workflows define the beta. Tests must exercise actual UI and persisted data, not only reducer functions or screenshots.

| Workflow | Required behavior | Acceptance evidence |
|---|---|---|
| First run | Enter desktop, understand local storage and network limitations, find Files/Notepad/Editor and app catalogue | Fresh-profile E2E; keyboard flow; returning-user flow |
| Notes | Create, edit, rename, search, preview Markdown, close/reopen, export a note to Files | Component tests + browser E2E + persisted-content assertion |
| Files | Import files/folders where supported, create folders, open/download/delete, handle names and sizes safely | IndexedDB tests + browser E2E + real-file round trip |
| Editor | Create/edit text and code, open from Files, save/export, recover session state without pretending a stale file handle remains valid | Buffer tests + browser E2E |
| Craft handoff | Launch selected document apps, open supported file types, return/save/export via documented paths | Per-app smoke matrix; distinguish integrated handoff from generic iframe launch |
| Backup | Export a versioned archive/manifest containing all supported WebOS-managed state | Golden archive tests, checksum and manifest validation |
| Restore | Preview, validate and restore into a clean profile; reject malformed/oversized/incompatible input; explicit conflict/overwrite decisions | Clean-profile E2E, negative fixtures, data-integrity comparison |
| Offline / reconnect | Shell and supported local files remain accessible after the first load; external apps explain network requirements | Browser offline/online E2E; no claims for uncached third-party apps |
| Recovery | Corrupt data, quota exhaustion, interrupted import and migration errors are visible and recoverable where possible | Fault-injection tests and user-visible error assertions |
| Accessibility | Keyboard-only operation, focus management, live announcements, zoom/reflow and reduced motion on the core flows | Automated gates plus manual keyboard/screen-reader checklist |

## 4.1 Capability parity and product-quality scorecard

Parity is measured at the **user-workflow level**, not by counting apps, menu items, lines of code or passing unit tests. Do not claim broad Windows/macOS/Linux or Office-suite parity from a familiar shell, a catalogue entry, or an embedded app opening.

Every user-facing capability must have one explicit state:

- **Implemented:** code exists, but no complete acceptance receipt has been recorded yet.
- **Verified:** the scenario passes on the exact candidate/release build, including persisted data and expected failure behavior.
- **Limited:** the capability works only under documented constraints (for example, a supported browser, an app that permits iframe embedding, or an online external Craft app).
- **Planned:** accepted future work, not available to users.
- **Unsupported:** intentionally not promised in this product/runtime.

The MVP scorecard is:

| Surface | MVP parity target | Required proof |
|---|---|---|
| Desktop shell | Reliable desktop navigation, window lifecycle, app launch, settings and keyboard operation—not kernel/driver parity with a native OS | First-run, launch, focus/minimize/close, keyboard and mobile E2E |
| Files workspace | Practical local file/folder create, open, rename, move, delete, import and export with explicit browser storage limits | Real-file round trips, path/Unicode/size cases, reload persistence, backup/restore |
| Notepad | Everyday plain-text/Markdown note creation, editing, preview, organization and export | Real editing flows, autosave/dirty-state, reopen and export byte comparison |
| Editor | Everyday text/code editing with reliable open/save/download behavior; no promise of a full IDE | Open from Files, edit, save/export, reload/reopen, large-text and Unicode cases |
| Craft applications | Launch supported apps and provide only the host-level file storage/open/export integration that is tested. Each Craft app's own feature parity remains independently owned and versioned | Per-app tested integration matrix; app launch alone is not a host-integration pass |
| Browser/PWA | Useful browser-hosted workspace and installable shell within documented web-platform constraints | Supported-browser, offline/local workflow, service-worker update and external handoff tests |
| AI | No AI capability is required to complete MVP workflows. Chat remains clearly unavailable until a real provider adapter exists | No-model state shown honestly; no placeholder/echo result represented as AI |

A feature should move from Implemented to Verified only when the test checks the user-visible result, the persisted or exported bytes, and the relevant failure/permission behavior. A screenshot or app-launch smoke is supporting evidence, not the whole receipt.

For external Craft products, record two independent results: (1) **upstream application capability** at its own released version, and (2) **WebOS integration capability** (launch, storage, open-with, export, lifecycle). Do not attribute upstream feature completeness to WebOS, and do not count an iframe launch as proof of data portability.

The product-quality gate should track task completion and data integrity, not only coverage: critical workflow pass rate, restore success on a clean profile, failed/partial import containment, escaped defects, accessibility blockers, browser-specific failures and pilot-reported data-loss incidents. Keep existing lint, coverage and security ratchets as regression controls.

### Data scope and backup contract

The backup is for **WebOS-managed data**, not an indiscriminate browser-profile dump.

The initial backup format should have a documented schema/version, manifest, checksums, item sizes/types, export timestamp, and per-item namespaces. It should include WebOS settings, the Files virtual disk, supported first-party app state, and the app bridge's managed storage namespaces where the host can enumerate and read them.

It must explicitly exclude browser credentials, private keys, browser cookies/history, arbitrary remote-origin localStorage/IndexedDB that the shell cannot access, and unsupported third-party app databases. Those exclusions must appear in the backup UI and help docs. Import must treat bytes as data; it must never install or execute app code.

Restore should validate the entire archive before mutating live state, stage writes or use a recoverable transaction strategy, surface conflicts, preserve the existing data until the user confirms replacement/merge, and provide a deterministic rollback path when an import fails. Schema migrations must be explicit and tested from previous released fixtures.

## 5. Delivery sequence

### MVP-00 — Re-establish one accurate baseline (P0)

- Record the exact `main` SHA, release tag, Pages deployment identity/hash, app registry versions and current browser matrix.
- Refresh open PR/issue status; identify work already implemented on main and work duplicated across open branches.
- Run the canonical CI and E2E sweep on the chosen candidate commit and record logs/receipts.
- Reconcile the status board, app catalogue, quickstart, architecture references and release documentation.
- Establish one active backlog for MVP work: issue #37 and its linked P0 tasks. Treat native/ISO/ROM and generic WASM work as separate.

**Exit:** a reproducible baseline and a short, prioritized implementation queue; no task based on stale documentation.

### MVP-01 — Data portability and recovery (P0)

Primary owner: storage/data-integrity workstream.

- Map all WebOS-managed state by namespace and persistence mechanism.
- Define the backup schema and supported/excluded data inventory.
- Implement archive export with manifest, size limits, checksums and deterministic serialization.
- Implement import preview, validation, conflict strategy, staged restore, rollback and explicit confirmation.
- Add quota handling, corrupt-state diagnostics, migration fixtures and recovery UX.
- Cover the Files store, settings, first-party app state and managed iframe storage.
- Add user documentation for browser profile loss, private browsing, storage clearing, origin changes and backup frequency.

**Exit:** export → clear a disposable profile → restore → compare files/settings/app data → use the restored workspace without data loss; malformed and hostile archives fail closed.

### MVP-02 — Complete the daily productivity loop (P0)

Primary owner: app/workflow workstream.

- Make Files, Notepad and Editor feel like one coherent local workspace.
- Verify open-with, save-to-Files, download/export and document handoff for the selected Craft apps.
- Add consistent dirty-state, save status, error, retry and recovery affordances.
- Validate common file types, large-file boundaries, Unicode paths/names, duplicate names and interrupted operations.
- Use the existing app bridge for host-managed storage; do not invent app-specific persistence shortcuts.

**Exit:** a new user can create/edit/import/save/export/restore a representative work set using the documented workflow matrix.

### MVP-03 — Onboarding, usability and accessibility (P0/P1)

- Explain the browser/PWA capability boundary at the point it matters.
- Keep persona choice reversible and separate from starter workflow layout.
- Make the key workflows responsive at desktop, tablet and supported mobile widths.
- Verify keyboard navigation, focus order, dialogs, screen-reader status, zoom, contrast and reduced motion.
- Make permission, network, unavailable-app and storage errors actionable rather than silent.

**Exit:** core task completion is reliable without a walkthrough from the maintainer; the documented browser/accessibility matrix passes.

### MVP-04 — Release and pilot operations (P0)

- Tag one candidate from a clean, reviewed PR stack.
- Run lint, unit/integration/coverage floor, Aegis, CodeQL, production build, bridge tests and browser E2E on the exact release SHA.
- Validate the generated PWA and app asset manifest, checksums, dependency inventory/SBOM and release metadata.
- Deploy the exact build, compare served asset hashes and service-worker cache stamp, then run a production smoke.
- Publish installation, backup/restore, privacy, supported-browser, known-limitations and support instructions.
- Invite a small opt-in pilot cohort; collect workflow failures and recovery reports before broad promotion.

**Exit:** a pilot user can complete the acceptance matrix on the deployed build, recover from the documented failure modes, and report issues with reproducible evidence.

### After MVP — separate investments

1. Real optional AI provider router and capability-scoped assistant (issue #21; not a substitute for the deterministic core).
2. Onboarding/starter layout polish (issue #16).
3. WASM Workbench and generic module package model (issue #19).
4. Shared SDK, common libraries and CLI/MCP tool discovery.
5. Optional identity, sync, collaboration and encrypted continuity.
6. Native host, Linux ISO/installed system with Btrfs, and device-specific ROM.

## 6. Engineering methodology: improve throughput without lowering quality

The current record does not establish that model-token cost, agent harness limitations, or runner capacity caused the slowdown. The evidence supports a clearer immediate problem: the project lacks a single MVP acceptance target, has multiple parallel planning documents, and has work sitting in independent branches. The full main-branch CI and latest scheduled CodeQL both passed; the most recent code commit is November 3. This points more strongly to scope/coordination/merge throughput than to a demonstrated CI failure.

Treat token spend and infrastructure as measurable hypotheses, not assumed root causes.

### Work intake and work-in-progress limits

- Every implementation task starts from an issue with a user outcome, acceptance tests, file ownership, dependencies and a named accountable integrator.
- Keep no more than two active implementation workstreams before MVP: data portability/recovery and core user workflows. A reviewer/test owner may work alongside them when ownership is disjoint.
- Do not create a new architecture layer, package format or service without a real MVP consumer and a measured gap.
- Prefer narrow vertical slices over broad audit/refactor campaigns. A slice is complete when the user-visible behavior, tests, help text and release evidence land together.
- Keep PRs single-purpose, reviewable and small enough to reason about. Split independent work instead of accumulating mixed code, docs, refactors and packaging changes in one PR.
- The integrator reconciles competing PRs and docs before starting another parallel track. No long-lived branch should become a second source of truth.

### Agent and token-efficiency protocol

For each agent-assisted task, record a small task receipt:

- issue/PR and target user outcome;
- model/provider and task start/end;
- input/output/cached token counts when the platform exposes them;
- number of tool calls and context compactions when available;
- wall-clock time divided into queue/wait, active generation, build/test and review;
- changed-file count, diff size, tests run, CI result, rework/retry count;
- acceptance outcome: shipped, partially shipped, rejected or blocked.

Use those receipts to compare cost per accepted user-facing outcome—not raw tokens per line of code.

Agent execution rules:

1. Read repository-level instructions and this execution plan first; inspect only the modules and references needed for the assigned task.
2. Reuse the existing issue, worktree, test fixtures and prior tool results; do not repeatedly rediscover the same repository facts.
3. Ask one agent to own a file set. Parallel agents must have disjoint file ownership and a clear integration point.
4. Run targeted tests during iteration. Run the expensive full CI/E2E gate at integration points and before release; avoid multiple agents repeatedly building the same unchanged tree.
5. Never ask an agent to "audit everything" and then start a second agent to independently audit the same surface. Use specialist review only when it can falsify a concrete risk or acceptance criterion.
6. If two iterations produce no working code, test, verified finding or smaller task, stop and re-scope the task.
7. Do not spend agent time increasing coverage beyond the current ratchet unless the new test protects a product workflow or a concrete defect class.

### Harness and infrastructure measurement

Separate queue time from execution time. For each GitHub Actions and GitForge run, collect runner class, queue delay, job duration, cache hit/miss, artifact size, CPU/memory/disk pressure, retry/cancellation reason and parallel-job contention. Compare cold and warm runs on the same commit.

Do not switch runners, add remote compute, or introduce another CI service until the measurements show a specific bottleneck. The current GitHub receipts show the main CI passing on 2026-11-03 and scheduled CodeQL passing on 2026-11-09; no post-November-3 main code commit or full CI run was found in this audit. This is a merge/implementation cadence signal, not proof that hardware or the harness is too slow.

### Productive progress metrics

Track these weekly:

- P0 acceptance items completed and remaining;
- median issue-open → merged-PR lead time;
- active PR count and age, with blocked reason;
- number of end-to-end user workflows passing on the deployed build;
- data restore success/failure rate from pilot tests;
- escaped defects and rollback/recovery incidents;
- CI queue time vs runtime and repeated builds per change;
- measured agent cost per accepted task when telemetry is available.

Coverage, lint and security remain quality guardrails. They are not substitutes for user workflow completion.

## 7. Release and support policy

- Keep the browser/PWA local-only experience functional without an account or AI provider.
- State clearly that browser storage can be cleared or evicted and is not equivalent to a backed-up native disk.
- Never market sync, E2EE, arbitrary WASM execution, a full browser engine or native OS support before each is implemented and independently verified.
- For every app, distinguish bundled plugin, external iframe app, host-bridged app and ordinary external browser handoff.
- Any production release must include backup/restore instructions, support boundaries, release SHA, artifact hashes, known issues and a way for pilot users to report reproducible failures.

## 8. Source-of-truth rules

| Concern | Authority |
|---|---|
| MVP scope, acceptance and sequence | This document + issue #37 |
| Long-term product direction | [product-vision.md](product-vision.md) |
| Long-term SDK, packages and native OS architecture | [PLATFORM-ARCHITECTURE-ROADMAP.md](PLATFORM-ARCHITECTURE-ROADMAP.md) |
| Current observed implementation | Code, tests, registry and release receipts |
| Current project status | [PROGRESS.md](PROGRESS.md) |
| Agent continuation and operating procedure | [HANDOFF.md](HANDOFF.md) |
| Shipped release history | [HISTORY.md](HISTORY.md) |
| Historical quality findings | [QUALITY-PROGRAM.md](QUALITY-PROGRAM.md), as dated evidence only |

When these documents conflict, current code and verified release/CI evidence determine what is implemented; this file determines what is next. Historical phase and quality plans must not override the MVP sequence.

## 9. Immediate execution order

1. Reconcile the existing PR stack and the stale Page Agent/roadmap branches against current `main`.
2. Start MVP-00 and complete the release/app/browser/data inventory.
3. Promote issue #17 backup/restore to the first implementation milestone under MVP-01.
4. Select two or three representative end-to-end productivity workflows and make them reliable before adding new app classes.
5. Complete MVP-02/03, then cut a clean pilot release through MVP-04.
6. Use pilot evidence to decide whether AI router, identity/sync or native runtime is the next highest-value investment.

The success criterion is not that the roadmap is comprehensive or that CI reports a high coverage percentage. It is that a person who did not build WebOS can use the deployed product for real work, understand its limits, and trust the documented data export and recovery process.
