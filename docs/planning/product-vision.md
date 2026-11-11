# ArtCraft WebOS: product vision and roadmap

**Status reviewed:** 2026-11-10  
**Current implementation:** browser desktop prototype, latest published release v3.25.0 (2026-11-03)  
**Near-term delivery:** [Productivity MVP issue #37](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/37)  
**Long-term roadmap:** [GitHub issue #13](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/13)

## Near-term delivery decision — browser-first productivity MVP

The first real-user milestone is a dependable, local-first productivity desktop delivered through the browser/PWA. The shell, Files workspace, Notepad, Editor, curated Craft app catalogue, and their end-to-end save/export/recovery workflows should become coherent before more platform layers are added.

The active execution order, acceptance matrix, data backup contract, release gate, and engineering throughput method live in [MVP-EXECUTION-PLAN.md](MVP-EXECUTION-PLAN.md) and [issue #37](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/37). The native host, Linux ISO/Btrfs, device ROM, generic WASM runtime, identity/sync, and full AI agent system remain valid long-term directions but do not block this browser-first MVP.

## Product vision

ArtCraft WebOS aims to make a person's computing environment portable and
adaptable. The experience should be available from a browser, with a path
toward native installations that can run on supported hardware. A person's
apps, settings, and chosen data should be able to follow them between
devices, with clear control over what is stored locally and what is synced.

AI should help people customize the environment and contribute apps,
workflows, and fixes. Any agent-assisted change should remain inspectable:
show the proposed changes, run the relevant checks, and let the user choose
whether to open an issue or pull request. Publishing or deploying a change
must remain an explicit, reviewable step.

This is a direction for the project, not a description of current product
capabilities. The project is at prototype stage; each capability needs its
own design, security model, tests, and release evidence before it can be
presented as available.

## Verified current scope

The current product is a browser application with a desktop-like shell,
including windows, a taskbar, an app launcher, settings, and a virtual Files
disk. It has 13 bundled first-party plugins and 13 externally registered
Craft apps, including FireCraft and SolidCraft. Files persist in IndexedDB;
Notepad and Editor keep local browser state and expose file export paths.
Data remains scoped to the browser origin/profile, and user-visible complete
backup/restore is still an open MVP requirement.

The AI Chat adapter currently reports that no model is configured. It is an
integration seam, not a working AI assistant in the published build. The
product must remain useful without AI, and any future provider integration
must be real, opt-in, and explicit about where prompts and context are sent.

The repository's [quickstart](../getting-started/quickstart.md),
[app guide](../getting-started/apps.md), and
[architecture overview](../architecture/overview.md) describe the current
implementation. The live prototype is at
[artcraft-webos.pages.dev](https://artcraft-webos.pages.dev/).

## Architecture program

The long-term platform architecture is tracked in
[PLATFORM-ARCHITECTURE-ROADMAP.md](PLATFORM-ARCHITECTURE-ROADMAP.md).
It coordinates five concerns that must evolve together: a shared platform
SDK and reusable component/library ecosystem; safe app and game packaging;
one capability model for the shell, terminal, CLI, MCP, and AI agents;
local-first storage and portable identity; and a path from browser/PWA to
native installations and device-specific builds.

The goal is not to turn every app into one monolith. Apps should remain
independently developed, versioned, installable, and permission-scoped while
reusing common code and services where the measured runtime and distribution
model permits it. Code sharing inside one Vite build differs from sharing a
library across isolated cross-origin iframe apps or separately compiled WASM
binaries; those cases must be measured and designed explicitly.

## Gaps that define the roadmap

- There is no native bootable image or supported hardware matrix.
- There is no user identity, cross-device session, or cloud synchronization.
- WebAssembly support is not an arbitrary binary upload-and-run sandbox.
- The app collection does not yet replace the range of tools people need
  for everyday computing.
- The same-origin browser proxy was removed for security and issue #12 is
  closed. Remote HTML must not execute with the WebOS origin. Frame-hostile
  sites require normal browser-tab handoff; no proxy replacement is assumed.
- User-visible backup/restore for WebOS-managed data is not complete
  (issue #17) and is the first major MVP data-safety requirement.
- AI Chat has no configured production model adapter (issue #21); do not
  describe the shipped echo/no-model adapter as an assistant.
- AI-assisted app authoring and contribution workflows are not implemented.

## Phased roadmap

### 1. Make the browser prototype safe and dependable

Keep the resolved [proxy isolation boundary](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/12) enforced, document the browser security boundary, and make local data export/recovery understandable. Establish release checks for app provenance, storage compatibility, browser support and accessibility. The active MVP execution plan prioritizes backup/restore and real end-to-end work before account or sync features.

**Resolved:** the proxy was disabled rather than isolated (2026-11-01) —
no remote page executes with the WebOS origin, and the fail-closed endpoint
is pinned by regression tests. The browser security boundary is documented
in [architecture/browser.md](../architecture/browser.md). Local data export
and recovery, and the release checks for app provenance, browser support,
and accessibility, remain standing requirements.

### 2. Grow useful daily workflows

Prioritize coherent workflows over a large app count: writing and files,
web research, media, communication, development, creative work, and games.
Build and reuse shared UI primitives, platform-service clients, domain
engines, and app-level libraries where they reduce duplicated code or shipped
bytes without coupling independent apps. Keep expensive apps lazy-loaded and
measure per-app and aggregate transfer/storage cost. Improve keyboard and
assistive-technology support, offline behavior, import/export, and
predictable persistence. Test workflows across desktop and mobile browsers.

**Exit evidence:** each supported workflow has documented limits,
end-to-end tests, keyboard coverage, and a reliable data export path.

### 3. Define a safe app and WASM package model

Before supporting user-supplied binaries, specify a versioned app manifest
and SDK, app lifecycle, dependency/shared-library declarations, capabilities,
permissions, resource limits, origin isolation, storage ownership, package
provenance, signing, update/rollback, and revocation. Define distinct adapters
for bundled plugins, cross-origin iframe apps, WASM component packages, and
future native packages; do not pretend they have identical trust or resource
boundaries. Build a disposable test environment for packages and make
permission grants visible to users. Keep bundled companion apps working
through the same documented contracts where practical.

**Exit evidence:** threat model and package format reviewed; hostile-package
tests cover the declared boundary; permissions are least-privilege and
revocable; install, update, rollback, and removal are tested.

### 4. Add user identity and device continuity

Design sign-in and synchronization as an opt-in layer. Define which data
can sync, end-to-end encryption and key recovery, device revocation,
conflict handling, offline changes, account deletion, and migration away
from the service. Keep a useful local-only mode.

**Exit evidence:** documented data flows and recovery model; multi-device
tests cover conflicts and offline use; users can export and delete their
data; local-only operation remains supported.

### 5. Build reviewable AI-assisted customization

Make AI a first-class, permission-scoped control plane over the same typed
capability and command catalog used by the UI and terminal. Add app-aware CLI
and MCP discovery/invocation, contextual tool schemas, bounded sessions,
audit records, and approval for destructive actions, external network
access, installs, privileged storage, and publishing. Let AI explain
settings, compose workflows, and draft apps/fixes; show file changes and
permissions before applying them. Run tests and security checks, then prepare
an issue or pull request for human review. Separate local execution from
publishing, deployment, and access to user data.

**Exit evidence:** permission-scoped tools, visible diffs, reproducible
checks, attribution, and explicit approval before external publication.

### 6. Explore a native and bootable system

Treat an ISO, installed Linux system, and device-specific ROM as separate
delivery targets built on shared platform contracts—not as browser builds
with a different wrapper. First define the host runtime, supported hardware,
boot and recovery paths, secure updates, encryption, drivers, graphics/audio/
network/input services, power management, and how the shell maps to host
capabilities. For a real Linux installation, design partitioning, filesystems
(including a Btrfs subvolume/snapshot/rollback strategy), package delivery,
bootloader integration, and user-data migration explicitly. A browser-only
runtime cannot provide raw block-device or Btrfs services. Prototype in VMs
and live images before promising broad hardware support; treat native ROMs as
separate, device-specific engineering work with bootloader, kernel, driver,
verified-boot, OTA, and recovery requirements.

**Exit evidence:** published hardware matrix, reproducible image build,
verified install/upgrade/rollback, recovery tests, and a clear security
maintenance model.

## Delivery principles

1. Keep the browser prototype useful as a local-only product while future
   services remain optional.
2. Treat identity, synchronization, arbitrary WASM, and native boot as
   separate risk-bearing projects with explicit review gates.
3. Prefer user-owned export formats and documented interfaces so the
   environment is not locked to one device or service.
4. Publish measured compatibility and test evidence; do not imply that a
   planned capability is already implemented.
5. Accept community and AI-generated contributions through the same
   issue, review, test, and release process.

## Source of truth

This document describes long-term product direction. The [MVP execution
plan](MVP-EXECUTION-PLAN.md) and [issue #37](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/37)
govern near-term delivery; [roadmap issue #13](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/13)
tracks the broader user-owned OS vision. Implementation status belongs in
code, tests and release receipts. Keep historical plans as historical
records rather than competing active task lists.
