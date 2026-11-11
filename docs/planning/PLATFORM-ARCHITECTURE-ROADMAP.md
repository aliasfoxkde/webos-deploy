# ArtCraft WebOS — Shared Platform, App Ecosystem, AI Control, and Native Delivery Roadmap

> **Status:** architectural work order; proposed and not implemented as a complete platform.
> **Reviewed:** 2026-11-10.
> **Long-term product authority:** [product vision](product-vision.md) and [roadmap issue #13](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/13).
> **Near-term delivery authority:** [MVP execution plan](MVP-EXECUTION-PLAN.md) and [issue #37](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/37).
> **Current plugin design:** [WebOS app architecture](webos-apps/ARCHITECTURE.md).
> **Current file bridge:** [bridge protocol](../architecture/bridge.md).

This document is the long-horizon architecture roadmap, not the active sprint backlog. The first real-user milestone is a dependable, local-first browser/PWA productivity beta. It is sequenced and accepted by [MVP-EXECUTION-PLAN.md](MVP-EXECUTION-PLAN.md); native installation, ISO/Btrfs, ROM, universal WASM, identity/sync, and the generalized SDK do not block that milestone. Keep the long-term architecture ambitious, but do not allow it to displace the immediate MVP acceptance work.

Do not describe a planned capability as shipped until its implementation, threat model, tests, and release evidence exist.

## 1. Product direction

The long-term goal is a user-owned productivity operating environment that can be used as a daily driver, with one coherent app and data experience across:

1. **Browser:** launch from any supported modern browser, without requiring an OS install.
2. **PWA/offline:** installable browser experience with controlled local persistence, offline-capable workflows, and explicit update behavior.
3. **Native desktop/installed system:** a real host integration with filesystem, processes, device services, secure updates, recovery, and an installer.
4. **Live ISO/recovery media:** bootable media for evaluation, installation, repair, and recovery.
5. **Device-specific ROM/image:** hardware-specific ports only after a supported device, boot chain, kernel, drivers, and recovery process are demonstrated.

The same product identity, app manifests, user-facing workflows, capability model, and portable data formats should span these targets where possible. The implementation adapters will differ. A browser tab is not a kernel, an iframe is not a process sandbox, IndexedDB is not a native filesystem, and a web bundle cannot partition a disk or configure Btrfs.

The goal is not one giant application. WebOS should remain a platform: the shell and core services provide stable capabilities; independently developed apps and games consume them through a versioned SDK and least-privilege package model.

## 2. Current implementation baseline (verified 2026-11-10)

The repository already has useful foundations:

- The app registry combines external app rows with bundled plugin manifests.
- The app manifest barrel separates data from the React component barrel, preventing the OS registry from importing the full component graph.
- React.lazy and Vite create per-plugin lazy chunks; heavy dependencies such as CodeMirror are loaded on first launch rather than eagerly in the desktop shell.
- The IndexedDB-backed virtual disk is available through an app file bridge. The bridge scopes embedded apps to a private /Apps/<appId>/ directory and validates origin, source window, message type, and relative path.
- The host bridge already supports request/reply messages and a FireCraft-specific style of app control.
- The bundled Terminal's wosh command layer can operate on WebOS state and Files storage.
- The Chat app has a provider adapter seam, but does not ship a configured model.
- The app architecture audit explicitly records that sibling Craft WASM builds lack a browser-safe CLI/MCP control surface; a host cannot expose craft <app> <command> until each app supplies a typed bridge.

These are foundations, not a claim of full CLI/MCP, native OS, or arbitrary-WASM package support. The current application remains an experimental browser desktop. See the README and product vision for the current product boundary.

## 3. Target architecture

Keep contracts stable and replace host adapters by target.

                    USER / WORKFLOW / AI AGENT
                               |
                 UI | Terminal | MCP clients
                               |
                  Typed Capability / Command API
                               |
             Consent | Policy | Audit | Session Broker
                               |
       +-----------------------+-----------------------+
       |                       |                       |
  Browser/PWA host       Native OS host          Test/VM host
  IndexedDB/VFS           Native filesystem       Fake services
  Web APIs                Process/runtime         Deterministic fixtures
  Browser GPU             GPU/audio/input         Fault injection
  Browser lifecycle       Power/network/device    Conformance tests
       |                       |                       |
       +--------------- Shared Platform SDK ------------+
                               |
             Shared libraries / engines / components
                               |
         +---------------------+----------------------+
         |                     |                      |
   Productivity apps      Creative apps          Games & tools
   bundled / hosted       Craft apps              WASM/native

### Layer A — platform shell and core services

Own only platform responsibilities:

- app catalog, installation state, launch/lifecycle, windows, focus, task switching, notifications, settings, theming, accessibility, and app crash containment;
- capability discovery and permission grants;
- local storage namespace, quotas, import/export, backup/recovery, and later optional sync;
- app-to-host and app-to-app IPC with explicit identity and authorization;
- network, clipboard, file picker, input, audio, GPU, camera/microphone, printing, and other device services through target adapters;
- telemetry and diagnostic events with user-visible controls and privacy limits;
- package verification, update, rollback, revocation, and compatibility reporting.

The shell must not import app implementation modules just to render the app catalog. Keep the current data-only manifest/component-barrel split and lazy app loading.

### Layer B — shared design system and UI components

Create a versioned platform design system rather than copy-pasting visual controls into each app. It should include:

- design tokens: color, typography, spacing, density, motion, radii, focus rings, and semantic status colors;
- accessible buttons, inputs, menus, tabs, dialogs, command palettes, tables, trees, notifications, tooltips, and empty/error/loading states;
- window/app chrome contracts and responsive layouts;
- icon, localization, formatting, validation, and keyboard shortcut conventions;
- theme integration that consumes WebOS theme tokens without hard-coded app palettes.

Build components as small, tree-shakeable modules. Do not force every app to import a complete UI framework. Define accessibility and keyboard behavior once, test it centrally, and keep domain-specific complex controls in the domain packages that own their semantics.

### Layer C — shared platform SDK and service clients

Provide one supported client for common WebOS capabilities:

- manifest and app identity;
- storage and app-private filesystem;
- file picker, import/export, clipboard, drag/drop;
- notifications, settings, theme, locale, and preferences;
- window sizing, lifecycle, focus, deep links, and app-to-app links;
- network request policy and credential handling;
- audio, GPU/canvas, media capture, gamepad, and device capabilities;
- logging, diagnostics, metrics, and error reporting;
- command registration and schema discovery;
- CLI/MCP tool registration and agent-session context.

The SDK must be versioned, documented, and usable by first-party and third-party apps. Browser and native implementations expose the same semantic API where support exists and report capability absence explicitly—never fake a native capability in a browser.

### Layer D — reusable domain libraries and engines

Create shared libraries when multiple apps need the same real domain behavior. Candidate families include:

| Library family | Reusable responsibilities | Example consumers |
|---|---|---|
| Documents and files | virtual filesystem clients, recent files, file metadata, preview dispatch, import/export contracts | Files, Editor, Notepad, WordCraft, FireCraft |
| Rich text and content | text model, markdown/sanitized rendering, search/index, clipboard formats | Editor, Notepad, WordCraft, documentation tools |
| Graphics and media | color, geometry, image decode/encode, compositing, filters, asset cache | Photos, FireCraft, PhotoCraft, VectorCraft, DeckCraft |
| Audio/video | media metadata, playback, capture, timeline primitives, device abstraction | Video, SoundCraft, CastCraft, games |
| Data and productivity | table/grid primitives, charts, CSV, query/data adapters, task/calendar models | GridCraft, planner, dashboard, business apps |
| Identity and security | permission prompts, credential vault client, session/device identifiers, policy result types | Shell, Chat, apps, agents |
| AI and automation | typed tool schemas, MCP transport adapters, prompt/context adapters, session and approval protocol | Terminal, Chat, craft apps, agents |
| Games and interaction | input maps, gamepad, audio cues, frame scheduler, save slots, pause/resume, achievements interface | bundled and third-party games |

Reuse domain engines independently of the UI. Prefer pure Rust or framework-neutral TypeScript for logic that must work across browser and native targets. UI adapters remain target/framework-specific.

Do not extract a library solely because two files look similar. Require at least two real consumers, a stable semantic contract, owner, tests, license review, and an A/B maintenance or bundle-cost justification. Shared code must not create a dependency knot or turn every app release into a lockstep release.

## 4. Shared code does not automatically mean shared downloads

Treat these as different optimization cases:

1. **Within one WebOS Vite build:** shared imports can become common chunks while app entrypoints remain lazy. Audit the generated chunk graph and verify an unopened app's dependencies are not downloaded at startup.
2. **Across app packages loaded by the same shell:** a versioned SDK and shared host services can avoid shipping duplicate platform code inside every app when those apps use the supported host integration.
3. **Across cross-origin iframe apps:** each iframe has a separate origin and JavaScript realm. Do not assume a module or in-memory object is shared merely because two apps import the same source package. CORS, CSP, immutable URLs, caching, and trust boundaries must be handled explicitly.
4. **Across separately compiled WASM apps:** each binary normally carries its own linked library code. A common Cargo crate improves source reuse and maintenance but does not, by itself, remove duplicate bytes from independently deployed binaries. To share runtime code, evaluate a host-provided capability service, common versioned module, WebAssembly component/import model, or a unified package/runtime. Prove compatibility and isolation before selecting one.
5. **Across native packages:** shared dynamic libraries can reduce disk use but introduce ABI, loader, update, and compatibility obligations. Compare them against static linking and package deduplication.

Every shared-library proposal needs a report of compressed bytes and cache behavior at cold/warm start; app startup and first-interaction latency; resident memory with multiple apps open; version conflicts and rollback; offline availability; security/isolation implications; and build/release coupling. The target is lower total bytes and overhead across a realistic workload, not merely a smaller individual app.

## 5. App and game package contract

Support multiple package/runtime classes without pretending they are interchangeable:

- **Bundled plugin:** first-party component compiled into the WebOS Vite application; current manifests and React.lazy remain a viable lightweight path.
- **Hosted web app:** external iframe with origin isolation, per-app storage namespace, and explicit bridge permissions.
- **WASM package:** sandboxed module/component with declared imports, host capabilities, resource budgets, versioned ABI, package signature, and revocation.
- **Native package:** future installed-system application with process/filesystem permissions and OS-level lifecycle.
- **Game package:** may use the plugin or WASM runtime but additionally declares frame/input/audio/gamepad requirements, save slots, suspension behavior, and GPU/resource budgets.

A package manifest should eventually declare stable package ID and publisher; semantic version and compatible SDK/API range; entry point/runtime type/required shared libraries; optional capabilities; requested permissions and justifications; storage namespace and data migration version; resource limits and lifecycle hooks; hashes, signature, provenance, license, and update channel; supported targets; and declared AI/CLI/MCP commands with typed input/output schemas and policy categories.

Installation, update, downgrade, rollback, revocation, data migration, and uninstall must be testable operations. An app must not silently gain permissions on update. User-supplied binaries remain out of scope until hostile-package tests exercise the actual sandbox boundary.

## 6. One command and capability model for UI, CLI, MCP, and AI

The UI, terminal, automation clients, and agents must not each invent separate action semantics.

### Command contract

A command/tool definition should have a stable namespaced ID and version; description and discoverable input/output schema; read/write classification and declared capabilities; validation and typed errors; cancellation, timeout, progress, and result semantics; idempotency/retry guidance where relevant; and audit metadata with a correlation/request ID.

The UI calls the same command service as the terminal and agents. The terminal is a user-facing local CLI; MCP exposes the same typed tool catalog to connected clients. Browser apps cannot listen on arbitrary TCP ports, so browser MCP integration must flow through an authenticated host bridge or user-authorized local companion service—not an invented in-browser socket server.

### AI-native control

AI-native does not mean unrestricted JavaScript evaluation or an all-powerful agent. The control model must provide app discovery and live capability/tool discovery; explicit app/session/user scoping; least-privilege read, write, storage, network, install, and device capabilities; confirmations for destructive, irreversible, externally visible, or privileged actions; limits on tool calls, execution time, concurrency, output size, and file size; cancellation, progress, observable results, and recoverable failures; an audit trail with user controls and sensitive-data minimization; safe handling of prompt injection from documents, web pages, files, app output, and tool results; and human approval for package publication, deployment, account/security changes, and other high-impact actions.

Keep model/provider choice separate from the platform control contract. The OS should be useful with no model configured and should support local or remote providers when the user opts in.

### FireCraft and sibling Craft integration

FireCraft already has a useful application-side foundation: GUI and native CLI/MCP operations use the same engine registry, and its WASM host exposes a postMessage bridge for open, apply, export, and save workflows. The current WebOS integration uses that bridge for app control/autosave, but the WebOS app architecture records that a general browser-safe craft CLI/MCP control surface is still missing upstream.

The future contract should preserve FireCraft's command registry and document model as the authoritative mutation path; expose command discovery and schemas to the WebOS host, not just arbitrary string command names; let the WebOS agent broker discover app identity, version, capabilities, command catalog, and health; translate authorized MCP/tool calls to the same app command service used by the GUI and native CLI; return typed results, errors, progress, and request IDs; enforce origin/source-window checks, targeted replies, per-app grants, session scope, rate/size limits, and auditable writes; and retain a standalone browser mode when WebOS is absent.

Do not remove FireCraft's scripting, CLI, or MCP foundations just to lower the current WASM size. Measure target-specific features and separate native transports from reusable domain/command semantics. The app must be optimized for both standalone use and host-integrated use.

## 7. Storage, identity, portability, and continuity

### Local-first baseline

- Keep the browser local-only mode useful without sign-in.
- Define a versioned storage API that maps to IndexedDB in browsers and native filesystem/services on installed targets.
- Give each app an isolated namespace, quota, export/import, recovery, and migration path.
- Preserve user files in documented, portable formats. Never make the only copy of a user's data an opaque cloud record.
- Provide explicit storage usage, backup, restore, and deletion UX.

### Optional identity and sync

Identity and sync are separate opt-in services, not prerequisites for local use. Before implementation, design device identity, account recovery, device revocation, session expiry; end-to-end encryption and key rotation/recovery; per-data-class sync consent and conflict resolution; offline writes, merge behavior, and multi-device tests; export, account deletion, and migration away from hosted services.

The browser shell, native shell, and app packages must never assume that a network connection or account is always available.

## 8. Browser, PWA, native installation, ISO, and ROM are separate targets

### Browser and PWA

Continue making the browser experience the first complete target: work from arbitrary browser origins and sub-paths; local persistence with export/recovery and quota handling; installability, offline app shell, controlled cache invalidation, and safe updates; permission prompts tied to specific apps and capabilities; browser compatibility and accessibility matrix; no claims of raw disk, privileged process, Btrfs, kernel, or driver access.

### Native host/runtime

Choose a native host only after a measured architecture spike. Compare embedding the same web shell with a thin native service host against a more native shell. The choice must account for native windowing, compositor/display scaling, keyboard/input, touch, audio, GPU, clipboard, printing, file access, process execution, networking, device discovery, app isolation, shared library loading/ABI stability, upgrade/rollback, recovery, diagnostics, power management, and hardware compatibility.

Do not commit to one framework or base distribution in this roadmap. Record the chosen host, base OS, runtime, and support matrix in a separate reviewed decision.

### Linux ISO and real installed system

A real installed OS requires a separate release and operations program: reproducible live ISO and installer; supported CPU/firmware/graphics/network/storage hardware matrix; bootloader, init/service manager, kernel, firmware, driver, and update strategy; partitioning, encryption, secure boot, recovery media, user creation, and first boot; signed atomic update path and verified rollback; app/package repository, dependency resolution, signatures, revocation, and offline install; and data migration from browser/PWA profiles into the native home directory.

Btrfs is a candidate filesystem for the installed Linux target, not a browser feature. Design it explicitly: subvolume layout for system, home, logs/state, and snapshots; compression policy; snapshot creation and retention; bootloader-visible rollback; filesystem scrub/health; quotas; encryption integration; backup; and recovery from failed updates. Decide whether system and user data need separate subvolume/snapshot lifecycles. Test destructive operations only in disposable VMs first.

### Device-specific ROM

A device ROM is not the same deliverable as an ISO. It requires an explicit device list, bootloader unlock/flash process, device-specific kernel/device tree, hardware drivers, secure/verified boot or an honest documented alternative, OTA update signing, partition layout, recovery/restore tool, radios/sensors/cameras/power validation, and a maintainable security-update commitment. Do not imply universal Android-device compatibility.

## 9. External ecosystem alignment: reuse the Craft foundation, then complete the SDK

ArtCraft WebOS should not independently recreate useful infrastructure that already exists in the wider Craft ecosystem. At the same time, WebOS has a broader remit than any one desktop-app suite: it must provide coherent browser, native, CLI/MCP, and eventually system-level contracts across apps that may not be written in Rust.

### Upstream library source

[storytold/craft-libs](https://github.com/storytold/craft-libs) is an existing Rust workspace for reusable Craft application libraries. It uses small crate boundaries, optional features, shared lint/test conventions, and pinned Git revisions; it is dual-licensed MIT OR Apache-2.0. Evaluate it as the first upstream source for Rust foundations rather than starting a competing collection of near-duplicate crates.

High-value candidates to review include:

- **Web integration:** craft-web-api and craft-web-host for common page-control and parent-host bridge semantics.
- **AI contracts:** craft-ai-core for versioned tool/model/request/consent/job data. Its current contract is not a general execution engine, agent runtime, or proof that a model/provider adapter exists.
- **Platform and persistence:** craft-platform, craft-atomic, craft-settings, craft-dialogs, craft-menu, and craft-window where their runtime assumptions match the host.
- **UI and domain primitives:** craft-ui, craft-cms, craft-keymap, craft-text, and focused format/media crates when actual consumers and compatible targets exist.

Use the [shared-library candidate criteria](https://github.com/storytold/craft-libs/issues/2): prefer mechanisms needed by at least two real applications, small boundaries, measurable quality/performance/maintenance benefit, explicit adapters or policy inputs for app-specific differences, and incremental adoption with tests. Distinguish extraction of identical code from consolidation of divergent implementations, common API standardization, and reusable UI components. A common crate is not automatically the right answer; preserve useful duplication when sharing would create coupling or erase product-specific behavior.

The WebOS host is currently React/TypeScript while many Craft applications are Rust/egui or Rust/WASM. Therefore the completed platform SDK must have two coordinated layers:

1. **Rust implementation libraries:** consume compatible craft-libs crates directly at immutable tested revisions where appropriate; keep dependencies feature-gated and avoid a monolithic umbrella crate.
2. **Language-neutral platform contracts:** versioned schemas for app manifests, command/tool descriptors, capabilities, permissions, storage, lifecycle, events, errors, and host requests. Generate or validate TypeScript and Rust bindings from the same contract, with conformance fixtures across runtimes.
3. **Host SDK/adapters:** TypeScript clients for the WebOS shell, browser bridge and broker; Rust adapters for native and WASM apps; CLI/MCP adapters that invoke the same command definitions.
4. **Product-specific APIs:** application-owned document models, editing policy, UX, and compatibility behavior stay in the application. The platform SDK supplies transport, policy enforcement, lifecycle, identity, and reusable mechanisms, not one universal document model.

craft-web-api/craft-web-host should be evaluated before inventing another browser bridge. FireCraft is a useful first consumer and test case, but the resulting contract must work for a second independent app before it is promoted as a general platform standard. Keep an adapter or compatibility period if the existing FireCraft bridge already has consumers.

### Shared DevOps, release, and contribution model

[storytold/craft-common-actions](https://github.com/storytold/craft-common-actions) already supplies reusable GitHub Actions for quality gates, packaging lint, and multi-platform release engineering. Reuse its proven patterns and contribute generic improvements upstream rather than cloning large workflow files into each repository.

Its current release pipeline provides a useful reference matrix: macOS universal; Windows x64/x86/ARM64; Linux x86_64/aarch64 GNU; Flatpak; Arch; FreeBSD x86_64 with an aarch64 cross-build path; WebAssembly; Linux RISC-V 64; and optional headless Linux server outputs. The FreeBSD aarch64 path requires app-specific packaging scripts to honor CARGO_BUILD_TARGET and per-app opt-in/receipts; the still-open rollout tracker is [#39](https://github.com/storytold/craft-common-actions/issues/39). It centralizes package/signing helpers, checksums, and release assembly. It is not a complete universal platform matrix: Android APK support (issue [#183](https://github.com/storytold/craft-common-actions/issues/183)), musl builds ([#168](https://github.com/storytold/craft-common-actions/issues/168)), and build-provenance attestations ([#29](https://github.com/storytold/craft-common-actions/issues/29)) are open proposals and must not be represented as shipped features.

Do not copy the workflow wholesale without checking its assumptions. Some jobs enforce Storytold-specific Git dependency policy and shared font/i18n inputs; packaging, signing secrets, architectures, and artifact names may need app-specific inputs or upstream changes. A reusable workflow must not silently omit WebOS-specific browser E2E, schema compatibility, security-boundary, data-migration, or deployed-hash checks.

The artcraft-candidates organization is an incubator and compatibility proving ground, not a transfer of source ownership. Its RFC ([storytold/artcraft#2336](https://github.com/storytold/artcraft/issues/2336)) explicitly aims to let independent authors retain their canonical repositories while candidate forks validate shared crates, multi-platform workflows, and cross-app integration. Follow that model: test on the candidate fork, send generic fixes to the relevant shared repositories, and merge app-specific changes back through reviewed PRs in the canonical product repository.

### SDK and release governance

A finalized shared SDK needs a small set of enforceable engineering standards, not just a package of helper functions:

- Semantic versioning for public crates and host contracts, explicit compatibility ranges, deprecation windows, migration guides, and backwards-compatibility tests.
- Dependency and feature budgets for each target; no native-only dependency in browser builds unless explicitly required and measured.
- Required formatting, lint, unit/integration/property tests, docs tests, security/dependency audits, license checks, packaging validation, and target-specific end-to-end probes.
- Reproducible build inputs, pinned toolchains/actions, protected release environments, least-privilege CI permissions, signed artifacts, checksums, SBOM, and source-to-binary provenance attestations.
- One release manifest linking every binary/package/module to its version, source SHA, target triple, ABI/API compatibility, feature set, checksums, signature, SBOM, and provenance.
- Test artifacts by install/launch/runtime behavior, not compilation alone. Keep Stable, Preview/Community, and Planned/Unsupported status separate for every platform and package format.
- Publish the SDK examples and contract tests as part of the release; an app should be able to integrate without copying internal source or reverse-engineering an installer.

The platform SDK and shared automation should evolve incrementally. Start with the bridge/API, a few high-value shared crates, a reusable conformance suite, and the common quality/release workflows. Expand only after multiple independent consumers prove the abstraction.

## 10. Phased execution order

| Phase | Theme | Main deliverables | Exit evidence |
|---|---|---|---|
| P0 | Current prototype stability | security boundary, reliable storage/export/recovery, accessibility, browser compatibility, release gates | CI, E2E, hostile-origin/storage tests, restore receipts |
| P1 | Shared platform foundations | design tokens/components, common service clients, module boundaries, shared-library inventory | at least two real consumers per extracted library; bundle/runtime A/B report; no cycles |
| P2 | App/game SDK and package model | versioned manifest, lifecycle, permissions, package verifier, dependency model, game capability contract | compatibility fixtures, install/update/rollback tests, hostile package tests |
| P3 | CLI/MCP/AI control plane | typed command registry, browser host broker, terminal integration, MCP discovery/invocation, approvals/audit | end-to-end agent operation against multiple apps with denied/allowed capability tests |
| P4 | Daily-driver app and game ecosystem | coherent writing, research, communications, development, creative, media, utility and game workflows; reusable domain libraries | workflow matrix, save/export portability, accessibility and performance tests |
| P5 | Local-first continuity | backup/restore, optional identity, sync, encryption, recovery, device revoke | offline/conflict/key-recovery/deletion test matrix |
| P6 | Native VM and live ISO | selected host runtime, reproducible image, installer, boot/update/recovery | supported VM/hardware matrix; install/upgrade/rollback and data migration receipts |
| P7 | Installed Linux/Btrfs daily driver | native services, package updates, snapshots, boot rollback, hardware support | independent install and upgrade certification on supported devices |
| P8 | Device ROM exploration | one named device port, verified boot/recovery/OTA, device-specific integration | reproducible signed image and tested recovery/rollback on physical hardware |

The phases are ordered by dependency, not calendar date. P1–P4 can overlap where interfaces are stable. Native image and ROM work must not block browser usability.

## 11. Engineering governance and acceptance

Every new shared library or platform service needs a named owner and at least two concrete consumers unless it is a platform primitive; API/ABI and versioning policy; dependency direction and no-cycle proof; unit, contract, integration, security, and compatibility tests; bundle, cold/warm load, memory, and runtime measurements; license/attribution and provenance record; and migration/deprecation and rollback plan.

Every app/game package needs a manifest and capability declaration; install/uninstall/update/recovery behavior; isolated storage and permission tests; keyboard/accessibility/mobile/browser verification appropriate to its surface; performance and memory measurements; and agent-tool schemas and policy category where automation is exposed.

Every native artifact needs a source SHA and reproducible build recipe; signed provenance and artifact manifest; hardware/VM test receipt; install, launch, data-preservation, update, and rollback proof; and documented recovery and security maintenance policy.

Maintain separate status labels for planned, designed, implemented, built, installed, tested, and supported. A checked-in manifest, successful compilation, or upload is not platform certification.

## 12. Immediate next actions

1. Audit the current WebOS shell and apps for duplicated primitives, dependency overlap, bundle chunks, state ownership, and platform-service access. Produce an inventory before extracting packages.
2. Define a first small set of shared tokens and UI/service contracts based on repeated production use, not speculative abstractions.
3. Profile the Vite output by entrypoint and plugin; measure cold launch and total cache footprint for a representative multi-app workflow.
4. Define a versioned browser app bridge contract and a conformance fixture usable by FireCraft and at least one other Craft app.
5. Design the typed command/capability schema before adding more terminal or MCP verbs.
6. Add a game package capability checklist before growing the game catalog.
7. Start the native effort with a VM feasibility/design decision and support matrix; keep ISO, installed Btrfs system, and device ROM as separately gated deliverables.

The near-term priority remains a safe, fast, useful browser desktop. Shared code, AI-native tools, games, and native installation are staged platform investments—not excuses to weaken current release quality or to destabilize working apps.
