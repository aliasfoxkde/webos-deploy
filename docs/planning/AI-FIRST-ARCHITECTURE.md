# AI-First ArtCraft / TaskWizerOS Architecture

**Status:** proposed cross-project architecture and integration contract.

## Product thesis

Build a user-owned productivity environment that follows the user across
devices. It remains useful without AI, becomes easier to extend with AI, and
does not require AI or remote services for core local work.

The OS is not a synchronized disk image. Identity, portable preferences,
workspaces, app catalog state, and explicitly selected documents follow the
user. Hardware drivers, display topology, device keys, local caches, browser
sessions, and machine-specific state remain local unless explicitly designed
otherwise.

## Existing foundations

### ArtCraft WebOS
- Browser-hosted React/Vite desktop and virtual window manager.
- Persona presets, taskbar, start menu, app catalog/store, widgets, and settings.
- First-party apps and separately built Rust/WASM web applications.
- IndexedDB virtual disk and local browser state.
- Existing AI Chat adapter seam (currently the no-model-configured adapter).
- Browser-style tabs and iframe rendering; not an independent Chromium engine.

### TaskWizerOS
- Shared PWA/native architecture and typed runtime capability model.
- OIDC Authorization Code + PKCE for browser and native clients.
- Capability availability separated from authorization; default-deny app permissions.
- Bundled/local/remote app-catalog trust tiers, sealed manifests, integrity checks.
- Workspace, user-preference, and installed-catalog synchronization.
- Native Linux CEF/Chromium runtime, Linux packaging, Android packaging, and live ISO.

Source-of-truth contracts:
- `TaskWizerOS/docs/architecture/capabilities.md`
- `TaskWizerOS/docs/architecture/identity.md`
- `TaskWizerOS/docs/architecture/data-model.md`
- `TaskWizerOS/docs/architecture/catalog.md`
- `TaskWizerOS/docs/operations/native-linux.md`
- `TaskWizerOS/docs/operations/live-iso.md`

The current sync contract is narrower than "the OS follows the user":
preferences, workspace layouts, and app-catalog metadata are sync eligible.
Device settings, browsing sessions/history, and credentials stay local.
Arbitrary documents and per-app databases are not automatically synced simply
because workspace metadata syncs. The sync service processes synced records in
plaintext behind TLS; it does not claim end-to-end encryption. Do not market
broader sync or E2EE until implemented and tested.

## Product architecture

```text
ArtCraft / TaskWizerOS shared product
|
+-- User identity (OIDC + PKCE)
|   +-- portable preferences, workspaces, layouts and app catalog state
|   +-- user-selected documents / app data (future sync namespaces)
|   +-- device-local credentials, keys, browser sessions and hardware config
|
+-- Shared desktop and app model
|   +-- versioned app manifest + integrity
|   +-- capability declarations
|   +-- settings, notifications, search and window lifecycle
|   +-- WASM/web app runtime where compatible
|
+-- Runtime adapters
|   +-- Browser/PWA: browser storage, limited file access, no host privileges
|   +-- Native Linux/ISO: CEF/Chromium, filesystem, downloads, OS services
|   +-- Android: mobile lifecycle and platform capability set
|
+-- AI orchestration
    +-- model/provider router (local, remote, Amortyx-compatible endpoints)
    +-- Page Agent browser interaction adapter
    +-- typed OS/app tools behind capability broker
    +-- developer/app-builder workflow
    +-- audit, user approval, rollback and contribution path
```

## AI-first contract

### AI is an interface to capabilities, not a privilege escalation

Model output is a request, never authorization. All actions pass through the
same typed runtime capability and per-app permission broker used by ordinary UI.

Every tool declares a stable namespaced ID and version, strict input/output
schema, required capability and data scope, runtime availability, risk tier,
approval policy, audit event, timeout, cancellation, idempotency, and typed
error outcome.

Default policy:
- Read-only discovery can run after the user starts a task.
- Reversible changes show a preview and offer undo.
- Externally visible actions (send, publish, install from an untrusted source)
  require explicit confirmation at the point of action.
- Destructive/system operations require a second confirmation naming the target
  and effect. Model output cannot self-approve.
- Unknown tool IDs, schemas, capabilities, and manifest fields are refused.

### Model routing

Use a provider-independent interface for local Ollama/OpenAI-compatible
endpoints, user-owned gateways such as Amortyx, and remote provider endpoints.
Expose per-task model selection with cost, latency, and data-destination
disclosure. Credentials stay device-local and must not enter public bundles,
app manifests, logs, generated PRs, or synced records.

## Page Agent integration

Alibaba Page Agent is the browser UI interaction adapter, not the whole OS
agent.

- The first WebOS integration uses the official Page Agent extension API only
  after the user installs the extension and supplies its authorization token.
- The token uses the exact `PageAgentExtUserAuthToken` localStorage key required
  by the extension. It is device/origin-local and is not synced.
- Provider base URL and model ID are local settings. The API key is memory-only.
- Each task requires user initiation and a page-content disclosure acknowledgement.
- The API excludes the initial WebOS shell tab and does not request experimental
  all-tabs access.
- Page contents and task instructions may be sent to the configured provider.
- Page Agent cannot thereby inspect WebOS Browser's cross-origin iframe content.
- Its extension currently supports normal browser windows, not installed PWA
  windows. Native CEF integration remains a separate engineering task.

Do not inject Page Agent scripts into arbitrary websites or restore the WebOS
same-origin HTML proxy. A future native integration must use an isolated content
context and narrow, brokered capabilities.

Official references:
- https://github.com/alibaba/page-agent
- https://github.com/alibaba/page-agent/blob/main/packages/extension/docs/extension_api.md
- https://github.com/alibaba/page-agent/blob/main/docs/terms-and-privacy.md

## WASM and application extensibility

Distinguish three artifact types:
1. **WebAssembly web app** (`wasm32-unknown-unknown` plus HTML/JS host):
   browser-sandboxed, uses web APIs and explicitly exposed WebOS capabilities.
2. **WASI command/component:** requires a WASI runtime and declared WASI
   capability profile. It does not automatically gain host files, sockets,
   processes, or devices.
3. **Native executable/package:** OS-specific, signed/provenanced, and subject
   to stronger install and trust policy.

An app builder creates source, a versioned manifest, tests, a previewable
artifact, and a permission report. Install validates schema, runtime
compatibility, integrity, requested capabilities, resource bounds, and publisher
trust. Default sandbox policies deny host filesystem/network/process access
until granted through the native broker. WASM alone is not a complete security
policy: imports, WASI interfaces, resource limits, and host functions define
the host boundary.

User flow: request an app; generate source in an isolated workspace; build and
test; inspect permissions/source; preview; explicitly install; export/share a
portable source bundle. The user owns the generated app and can contribute it.

## Community contribution loop

1. User asks for a new app, customization, or fix.
2. Agent creates a branch/worktree and change plan; never mutates protected
   branches or production directly.
3. Code is generated in an isolated workspace with resource limits.
4. Build, functional, accessibility, dependency/license, manifest, and
   security checks run.
5. User reviews the diff, permissions, artifacts, and test evidence.
6. With approval, agent may create an issue or PR with provenance and results.
7. Community review and repository rules govern merge and release. AI cannot
   self-approve or silently publish to community production.
8. Rollouts are staged, signed/versioned, and reversible.

A PR or issue is a contribution proposal, not deployment authorization.
Deployment to the user's own workspace can be separate and explicit; community
release remains maintainer-governed.

## "The OS follows the user": data contract to extend

TaskWizerOS sync is a foundation, not a promise that all user data roams.
Add explicit user-owned namespaces for selected documents/app data:
- Per-category opt-in and per-app disclosure.
- Stable IDs, schemas, offline queues, deterministic merges, conflict
  resolution, tombstones, and recovery.
- Per-device enrollment/revocation, quotas, retention, export/import,
  account deletion, and migration behavior.
- Encryption-at-rest and end-to-end encryption/key-recovery model before
  claiming that the sync operator cannot read user content.
- Multi-device enrollment without syncing raw device credentials.

Keep browser history, API keys, authentication secrets, and machine-specific
driver/network/display state device-local by default. Another device restores
the user's chosen workspace and app set, then retrieves only selected data
categories supported by that runtime.

## Daily-driver acceptance matrix

A 1.0 daily-driver claim needs a declared hardware/runtime matrix and repeatable
workflows for browser/password-manager integration, office documents and
spreadsheets, PDF, email/calendar/contacts, notes/tasks, photos/media, meetings,
printing/scanning, downloads, search, accessibility, networking/Wi-Fi/Bluetooth,
GPU acceleration, sleep/wake, multiple displays, updates, recovery, and offline
operation.

"Any hardware" is a long-term goal, not a support statement. Start with a
tested x86_64/UEFI matrix. Add ARM64 when drivers, graphics, suspend/resume,
and installer paths pass the same release gates.

## Delivery sequence

1. Remove same-origin remote HTML execution and retain an honest iframe hand-off.
2. Integrate the opt-in Page Agent extension adapter with token consent, provider
   setup, cancellation, scope disclosure, and tests.
3. Build a user-configurable model router in Chat for local, remote, and
   Amortyx-compatible endpoints with device-local credentials.
4. Introduce shared AI tools using TaskWizerOS capability vocabulary and
   approval broker.
5. Add a WASM Workbench for web modules and WASI components with runtime,
   permissions, inspector, tests, preview, and export.
6. Extend TaskWizerOS sync to selected documents/app data; design E2EE and
   multi-device recovery before stronger privacy claims.
7. Build app/customization generation and contribution workflows (branch,
   test, issue, PR, review, staged deployment).
8. Qualify native browser, hardware support, installer, Btrfs snapshots,
   update rollback, and recovery independently from PWA compatibility.
