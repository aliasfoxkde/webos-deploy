# Handoff — ArtCraft WebOS

> **Reviewed:** 2026-11-12.  
> **Product objective:** ship a dependable local-first productivity beta.  
> **Start here:** [MVP-EXECUTION-PLAN.md](MVP-EXECUTION-PLAN.md).  
> **Live status:** [PROGRESS.md](PROGRESS.md).  
> **Tracking issue:** [#37 — productivity MVP](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/37).

This handoff replaces the October continuation instructions. Those were written against older releases and an earlier work queue. Do not use their old runner paths, release numbers, app counts, phase statuses or PR assumptions as current facts.

## 1. Mission and scope

Make the current browser/PWA desktop usable for real productivity work. The current delivery stream now contains a first backup/restore implementation candidate; the next gate is to validate it with targeted tests, full CI and a disposable-profile browser recovery run. Follow that with a complete Files + Notepad + Editor workflow and tested handoff to selected Craft apps.

Do not delay this MVP for native ISO/Btrfs/ROM, arbitrary WASM, a broad shared SDK, identity/sync, or a complete AI agent. Those remain long-term architecture tracks.

## 2. Current verified facts

- Canonical main: `5b4fe552428f2fc02e7887897ceeb1744edb8fec`, committed 2026-11-02 7:47 p.m. Central (2026-11-03 01:47:19 UTC).
- Latest published release: v3.25.0, 2026-11-02 7:30 p.m. Central (2026-11-03 01:30:30 UTC).
- Full CI on that main SHA passed 2026-11-03; scheduled CodeQL passed 2026-11-09.
- Last recorded coverage baseline: 1,475 specs / 95 files; 98.88% statements, 94.86% branches, 98.95% functions, 99.91% lines. These are dated baseline values; rerun before release.
- 13 first-party bundled plugins and 13 external Craft app registrations.
- Files use IndexedDB; settings and some app state use localStorage. This is browser-profile persistence, not a backed-up native disk.
- Backup/restore implementation is on PR #36 (branch head must be refreshed before merge); it is not merged, released or clean-profile E2E accepted (issue #17).
- Published AI Chat has no production model configured; its no-model/echo adapter is not an assistant.
- The unsafe same-origin browser proxy was removed; issue #12 is closed.
- Native system install, identity/sync and arbitrary WASM are not current browser MVP capabilities.

PR #36 checkpoint `2ab390be6d538b64263775d3f8c84278ebaa688f` passed full CI [43072646913](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/43072646913) and CodeQL [43072647074](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/43072647074) on 2026-11-11. The latest follow-up adds the concrete storage inventory and backup/restore contract to MVP-01; its fresh CI [43073937714](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/43073937714) and CodeQL [43073937497](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/43073937497) were pending/queued at the last check. These are docs/MVP branch checks only; base `main` and deployed v3.25.0 are unchanged. Issue #17 still has no implementation PR and remains the first code milestone.

See [PROGRESS.md](PROGRESS.md) for the full baseline and open-work order. Refresh GitHub before acting: the table above is a snapshot, not a live API.

### 2.1 Current product boundary and backup candidate (2026-11-12)

The current product is strongest as a desktop-like shell for demonstrating and launching Craft apps. It is not a daily driver. Existing IndexedDB storage persists across ordinary reloads in the same origin/profile, and the Files app supports basic virtual-disk operations, but there is no production SSO/account service, device continuity, sync, user-owned native filesystem or full daily-driver application ecosystem.

PR #36 now includes an initial schema-v1 JSON backup candidate. It snapshots the Files store and explicit allowlists for `sqlite.db` and reviewed first-party `webos.*` state; records unsupported key names without exporting their values; validates size, shape, paths and SHA-256 integrity; and adds Backup/Restore actions to Files. Restore replaces the Files disk and only allowlisted values, preserving unknown/plugin/auth records, with an IndexedDB transaction and a localStorage rollback attempt. It is not yet a verified recovery feature: run targeted tests, full CI and the disposable-profile export/clear/restore workflow before accepting it. Current limits are 20,000 records, 128 MiB decoded payload and 180 MiB JSON archive; ZIP, merge/conflict resolution and broad browser-memory tests remain future work.

SSO/OIDC is required before a genuine daily-driver claim, but should be optional for local beta use. Do not mock an account system. Provider/backend selection, threat model, secure sessions, account recovery, device revocation and sync design are prerequisites. The long-term 90% common-use-case target and capability matrix are in [PLATFORM-ARCHITECTURE-ROADMAP.md](PLATFORM-ARCHITECTURE-ROADMAP.md), section 10.

## 3. Cold start (first ten minutes)

1. Read the repository-level agent/developer instructions that exist, especially `docs/AGENTS.md` and any root `AGENTS.md` / `CLAUDE.md`.
2. Read [MVP-EXECUTION-PLAN.md](MVP-EXECUTION-PLAN.md), then [PROGRESS.md](PROGRESS.md), then the last two entries in [SESSIONS.md](SESSIONS.md).
3. Check `git status`, current branch, current HEAD, and the base SHA. Preserve existing work. Do not reset, force-push or overwrite another agent's branch.
4. Refresh open PRs/issues and their base/head commits. PR #15 was closed as superseded by #36. PR #20 is a future Page Agent draft outside the MVP; verify its proxy/security assumptions against main before resuming it.
5. Inspect only the modules and tests needed for the assigned issue. The canonical plugin/module index is in [webos-apps/ARCHITECTURE.md](webos-apps/ARCHITECTURE.md); the bridge contract is [architecture/bridge.md](../architecture/bridge.md).

## 4. Work intake and implementation rules

- Every code task must link to an issue, user outcome, acceptance criteria, tests and file ownership.
- Work the priorities in [MVP-EXECUTION-PLAN.md](MVP-EXECUTION-PLAN.md). Issue #17 backup/restore is the first major implementation milestone.
- Keep at most two active implementation streams before MVP: data portability/recovery and core user workflows. Parallel agents must own disjoint files.
- Prefer small vertical slices: visible behavior, tests, docs/help, and evidence in one PR. Avoid broad mixed refactors.
- Reuse the existing shell, Files store, bridge, app manifests and command/service boundaries. Do not invent a second storage system without a measured requirement.
- No placeholder behavior or success-shaped failure in shipped code. The existing no-model Chat adapter must remain clearly unavailable until a real provider implementation is configured.
- Never treat app catalogue presence or an iframe opening as proof of file handoff, data persistence, offline behavior or AI integration.
- Do not relax existing lint, security, accessibility or coverage floors to make a branch green.
- Do not chase coverage above the ratchet unless the new test protects a user workflow or a real regression class.
- No new native service, package format or SDK abstraction without a concrete consumer and a small acceptance spike.

## 5. Test and verification routine

Run the narrowest relevant test first, then the canonical gates before handing off.

From `webos/`:

```sh
npm ci
npx vitest run tests/<relevant-test>.test.js
npm run ci
npm run sweep
```

- `npm run ci` runs strict lint, coverage with the existing floors, and the production build.
- `npm run sweep` builds and runs the headless-Chrome desktop E2E sweep.
- The GitHub CI workflow also runs the repository's security/docs/accessibility and browser validation steps. Check the actual required jobs for the current PR; do not infer a pass from another branch or an earlier commit.
- Run targeted tests during iteration. Avoid multiple agents rebuilding the same unchanged tree. Use one full gate at integration/release points.
- For data work, use disposable browser profiles and the real IndexedDB store. Test malformed archives, quota errors, interrupted writes, version migration and restore conflict paths.
- Browser screenshots are supporting evidence, not a replacement for checking persisted content and actual downloaded/exported bytes.

A handoff must state the exact commit SHA, commands actually run, pass/fail receipts, tests not run, changed user behavior, known limitations, and follow-up issue links.

## 6. Agent and token-efficiency procedure

The root cause of the recent slow cadence has not been measured at the token/harness level. Avoid guessing. For agent-assisted work, record when the environment exposes it:

- issue/PR, model/provider, task start/end;
- input/output/cached tokens and compactions;
- tool-call count and active generation time;
- build/test time and queue delay separately;
- files changed, diff size, retries/rework;
- whether the acceptance criterion shipped.

Optimize cost per accepted user-facing outcome, not token count per line.

Use one baseline discovery pass per task. Reuse its references; avoid asking multiple agents to perform the same broad audit. If two iterations produce no working code, test, verified finding or smaller task, stop and re-scope. If a tool fails, record the failure and choose a different grounded path rather than retrying the same expensive operation without new information.

For infrastructure, record runner class, queue wait, execution time, cache hit/miss, CPU/memory/disk pressure and retry/cancel reason. Do not add compute or change CI architecture until a measured bottleneck justifies it.

## 7. Branch, PR and documentation rules

- Work on a feature branch; main changes through reviewed PRs.
- Keep one concern per PR. Resolve competing/stale branches before opening another PR that edits the same files.
- Update the active plan only when priority/scope changes; update PROGRESS with completed evidence, not optimistic labels.
- Append SESSIONS.md at the end of an actual work session. Update HISTORY.md only for a shipped release.
- Preserve dated historical audit/phase material. Do not silently rewrite old evidence to look current.
- `docs/` is the canonical documentation source. GitHub Wiki pages were not retrievable in the 2026-11-10 audit; do not claim that the Wiki is synchronized until its pages can be inspected directly.
- Correct references when code, versions, URLs, or workflows change. Prefer links to one source of truth over copying the same checklist into several docs.

## 8. Release rules

A beta release needs a reviewed PR stack, passing current CI and browser E2E, version consistency across package/version/service-worker files, an exact source SHA, release manifest/checksums, tested backup/restore, supported-browser notes, privacy/data-flow disclosure, known limitations and a production smoke against the deployed bytes.

Do not claim that a platform or app is supported solely because it compiles, appears in the registry, or has an uploaded artifact. Test install/launch/use and its data path on the target. Verify served asset hashes and service-worker cache identity after deployment.

## 9. Essential reference map

| Need | Source |
|---|---|
| MVP scope and acceptance | [MVP-EXECUTION-PLAN.md](MVP-EXECUTION-PLAN.md) |
| Current state / blockers | [PROGRESS.md](PROGRESS.md) |
| Long-term product direction | [product-vision.md](product-vision.md) |
| Shared SDK / packages / native OS | [PLATFORM-ARCHITECTURE-ROADMAP.md](PLATFORM-ARCHITECTURE-ROADMAP.md) |
| App manifests and module map | [webos-apps/ARCHITECTURE.md](webos-apps/ARCHITECTURE.md) |
| Browser security limits | [architecture/browser.md](../architecture/browser.md) |
| Per-app storage bridge | [architecture/bridge.md](../architecture/bridge.md) |
| Shipped release history | [HISTORY.md](HISTORY.md) |
| Historical quality findings | [QUALITY-PROGRAM.md](QUALITY-PROGRAM.md), as dated evidence only |
| Build/test setup | [development/setup.md](../development/setup.md), [development/quality.md](../development/quality.md) |

