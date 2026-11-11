# Progress — ArtCraft WebOS

> **Snapshot reviewed:** 2026-11-11. This is the live status board, not a second roadmap.
> **Active near-term plan:** [MVP-EXECUTION-PLAN.md](MVP-EXECUTION-PLAN.md).
> **MVP tracking:** [issue #37](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/37).
> **Long-term vision:** [product-vision.md](product-vision.md) and [PLATFORM-ARCHITECTURE-ROADMAP.md](PLATFORM-ARCHITECTURE-ROADMAP.md).

## Verified repository and release baseline

| Dimension | Verified state |
|---|---|
| Canonical main | `5b4fe552428f2fc02e7887897ceeb1744edb8fec`, committed 2026-11-02 7:47 p.m. Central (2026-11-03 01:47:19 UTC) |
| Latest published release | [v3.25.0](https://github.com/aliasfoxkde/ArtCraft-WebOS/releases/tag/v3.25.0), published 2026-11-02 7:30 p.m. Central (2026-11-03 01:30:30 UTC) |
| Latest full main CI | [Run 41562004984](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/41562004984), passed 2026-11-03 on the current main SHA |
| Latest scheduled CodeQL | [Run 42621998306](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/42621998306), passed 2026-11-09 on the current main SHA |
| Latest recorded test/coverage baseline | 1,475 specs / 95 files; 98.88% statements, 94.86% branches, 98.95% functions, 99.91% lines (last recorded 2026-11-02; verify again before release) |
| First-party bundled plugins | 13: Browser, Calculator, Chat, Editor, Files, Notepad, Photos, Task Manager, Terminal, Video, Weather, Snippet and Cast |
| External Craft app registry | 13: CADCraft, DeckCraft, DesignCraft, EffectCraft, FireCraft, GridCraft, LightCraft, PdfCraft, PhotoCraft, SolidCraft, SoundCraft, VectorCraft and WordCraft |
| Local persistence | IndexedDB Files disk; browser-profile localStorage for settings and selected app state |
| Backup/restore | Not yet complete; tracked as P0 in [issue #17](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/17) |
| AI Chat | No production model adapter configured in the published main build; current adapter is the explicit no-model/echo seam |
| Browser security | Same-origin HTML proxy removed; [issue #12](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/12) is closed. Frame-hostile pages require normal browser-tab handoff |
| Identity/sync | Not shipped as a complete user-facing service |
| Native host / ISO / Btrfs / ROM | Long-term separate workstreams; not part of the browser MVP |

**Integration drift discovered during this refresh:** WebOS's registry and reference table currently pin FireCraft at **0.2.3**, while the canonical FireCraft repository has published **v0.2.5**. Do not change the WebOS registry by version-string substitution alone: verify the fetched web ZIP, deployed JavaScript/Wasm hashes, and host-bridge compatibility, then update the registry and deployment receipt together. Track this as MVP-00 app-registry reconciliation.

**PR-branch validation:** checkpoint `2ab390be6d538b64263775d3f8c84278ebaa688f` passed full CI [43072646913](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/43072646913) and CodeQL [43072647074](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/43072647074) on 2026-11-11. The follow-up backup-contract documentation commit is under fresh CI [43073937714](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/43073937714) and CodeQL [43073937497](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/43073937497), pending/queued at the last check. These checks validate the documentation/MVP PR branch only; they do not represent new application code, a new base-main run, or a production deployment.

The CI receipts above prove the state of the recorded commits only. The coverage figures are a dated baseline, not a new 2026-11-10 measurement. No full CI run newer than 2026-11-03 was found for `main` during this audit.

## Active milestone: local-first productivity MVP

The product objective is to make the existing browser desktop useful and safe for real users before expanding the platform architecture.

| Priority | Work | State |
|---|---|---|
| P0 | Establish current baseline, unify plans and correct stale references | PR #36 contains the reconciled MVP and platform plans; its docs branch passed CI and CodeQL on 2026-11-11, but remains unmerged and does not change main |
| P0 | User-visible backup/export and validated restore/import | Open; issue #17; first implementation milestone |
| P0 | Coherent Files + Notepad + Editor workflow and supported Craft app hand-off | Needs implementation-level audit and end-to-end acceptance |
| P0 | Recovery/error handling for quota, corrupt state, interrupted import and migration | Needs scoped test plan and implementation |
| P0 | Release candidate, browser E2E, deployed hash verification and pilot instructions | Not started for the MVP |
| P1 | Real provider-neutral model adapter with secure BYOK and cancellation | Open; issue #21; must not be represented as shipped |
| P1 | Onboarding/persona/starter-layout polish | Open; issue #16 |
| Later | Arbitrary WASM Workbench | Open; issue #19; explicitly outside the first MVP |
| Later | Capability-scoped agent contribution and app-authoring workflow | Open; issue #18 |
| Later | Shared SDK, app/game package ecosystem, native host, ISO/Btrfs and ROM | Architecture roadmap; not MVP blockers |

## Work in flight (audited 2026-11-11)

| PR | Scope | Current disposition |
|---|---|---|
| [#36](https://github.com/aliasfoxkde/ArtCraft-WebOS/pull/36) | MVP execution plan, product vision, shared platform and native architecture roadmap | Current plan of record. Branch checkpoint `2ab390be` passed full CI [43072646913](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/43072646913) and CodeQL [43072647074](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/43072647074) on 2026-11-11. This included lint, Aegis, shellcheck, docs coverage, WCAG contrast, tests/coverage, build, headless-Chrome E2E and artifact upload. A subsequent documentation update specifies the verified storage inventory, archive schema candidate, validation/conflict/rollback contract, and issue #17 implementation slices. That newer PR head has fresh CI [43073937714](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/43073937714) pending and CodeQL [43073937497](https://github.com/aliasfoxkde/ArtCraft-WebOS/actions/runs/43073937497) queued at the last check. PR remains unmerged; main and production release are unchanged |
| [#20](https://github.com/aliasfoxkde/ArtCraft-WebOS/pull/20) | Page Agent browser tools and AI-first architecture | Draft future work, not part of the productivity MVP. Rebase and re-audit its proxy/security assumptions against main before resuming |
| [#15](https://github.com/aliasfoxkde/ArtCraft-WebOS/pull/15) | Older production enhancement roadmap | Closed unmerged on 2026-11-11 as superseded by #36 and issue #37; useful concerns were reconciled into the MVP plan |
| [#35](https://github.com/aliasfoxkde/ArtCraft-WebOS/pull/35), [#34](https://github.com/aliasfoxkde/ArtCraft-WebOS/pull/34), [#33](https://github.com/aliasfoxkde/ArtCraft-WebOS/pull/33), [#32](https://github.com/aliasfoxkde/ArtCraft-WebOS/pull/32) | Dependency and Actions updates | Refresh their live state independently; keep maintenance PRs separate from MVP feature work |

Related open issues: #13 (long-term OS vision), #16 (onboarding), #17 (backup/restore), #18 (AI copilot/contribution), #19 (WASM Workbench), #21 (model router), #37 (MVP). The issue order does not imply all are equal priority.

## Current blockers and product truths

1. **Data portability is the primary blocker.** IndexedDB and localStorage persist inside one browser profile, but clearing site data/profile loss can remove local work. Backup/restore must be implemented and tested before promoting the product for normal user data.
2. **The core work loop needs proof.** Existing apps and bridges are useful foundations, but each supported create/edit/open/save/export/restore path needs an executable E2E receipt on the deployed build.
3. **AI is not an available default feature.** No model is configured in the published adapter. A later provider integration must be explicit, opt-in, cancellable and protect credentials/context.
4. **Browser limits must remain clear.** WebOS is not a full Chromium engine or native OS. External sites may refuse framing; external app storage not owned by the WebOS bridge is outside the host backup boundary.
5. **The plan set was fragmented.** Older phase/quality/OSS documents contained stale snapshots and open checklists. They are now marked historical; the MVP execution plan is the active sequence.
6. **Wiki state is unverified.** The repository reports Wiki support enabled, but the GitHub Wiki page/repository could not be resolved by the available GitHub interface during the 2026-11-10 audit. Do not claim a 13-page Wiki is current. In-repository `docs/` is the canonical documentation source until the Wiki can be inspected and synchronized.

## Definition of done

The MVP is ready for a limited real-user beta only when a clean-profile user can complete the workflow matrix in [MVP-EXECUTION-PLAN.md](MVP-EXECUTION-PLAN.md), export/restore supported data with integrity checks, complete core workflows with no AI/account configuration, use the published build within documented browser limits, and report issues against a release SHA with current support/backup guidance.

A green quality gate, a high coverage percentage, or a broad app catalogue alone is not MVP acceptance.
