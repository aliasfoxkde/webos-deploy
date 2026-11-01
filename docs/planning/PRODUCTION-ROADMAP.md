# ArtCraft WebOS — Production Enhancement Roadmap

**Status:** proposed roadmap, based on repository inspection on 2026-11-01.  
**Scope:** improve the browser-first ArtCraft WebOS shell and define a safe path toward a native, installable desktop/OS distribution. This document is planning, not a claim that native OS features already exist.

## Executive assessment

ArtCraft WebOS is already a substantial client-side desktop experiment rather than a blank prototype. The repository documents a Vite/React shell, app/plugin registry, window manager, persona presets, IndexedDB virtual disk, taskbar/start menu, app store, settings, widgets, PWA support, browser-style tabs, and extensive test/CI gates. The first-run welcome dialog and six visual personas already exist.

The main product gap is therefore not “add a welcome screen.” It is to make onboarding explain the capability boundary, make persona choice feel intentional and reversible, close high-risk browser isolation issues, and distinguish a browser desktop from a native OS with real system services and a full browser engine.

TaskWizerOS already owns the native Linux/CEF and live-ISO experiments. Keep that as the native runtime/distribution track rather than attempting to turn the CSR-first WebOS shell into a privileged OS from inside a browser tab.

## Product principles

1. **One shared shell, capability-aware runtimes.** Keep the core UI CSR-first and usable on ordinary hosting. Use explicit runtime adapters for browser/PWA and native desktop/ISO capabilities.
2. **Honest capability claims.** Label features as Available, Limited by browser, Native-only, or Planned. Never imply that an iframe is a full browser or that browser storage is a system filesystem.
3. **User choice without lock-in.** Personas are presets, not separate operating systems. Users can switch later, reset a persona, and preserve personal customizations unless they explicitly reapply preset defaults.
4. **Security before browser parity.** Remote pages must not share the privileged shell's origin or storage. Do not encourage sign-in through the existing same-origin proxy until the tracked isolation finding is fixed and tested.
5. **Reproducible, test-gated delivery.** Each artifact has an explicit support matrix, build provenance, checksums, smoke tests, and a documented update path.
6. **Upstream discipline.** Keep native Chromium/CEF changes minimal, pinned, auditable, and regularly updated. Avoid maintaining an unnecessary browser-engine fork.

## Phase 0 — Baseline and risk control (P0)

- Record current commit, deployed version, open PRs/issues, CI state, browser support, bundle sizes, app-catalog integrity, and current live URLs.
- Re-run the documented WebOS gates: `npm ci`, `npm run ci`, and the headless browser sweep. Capture exact results; do not infer passing status from documentation alone.
- Triage and prioritize existing browser-proxy security issue #12. Isolate arbitrary remote HTML on a separate origin or remove the proxy mode until an isolation design is proven. Revalidate redirect destinations, origin checks, CSP, cookies, service-worker behavior, and URL schemes.
- Keep the current open-source/readiness PR and security/roadmap issues in view; avoid duplicating already-tracked work.
- Add a release readiness checklist: accessibility, data-loss behavior, keyboard navigation, error recovery, storage quota handling, mobile layouts, offline behavior, dependency/security scans, and rollback.

**Exit criteria:** known risks are visible; no security-sensitive claim or release is based on an unverified test result.

## Phase 1 — First-run onboarding and persona UX (P1)

The welcome dialog already exists in `webos/src/shell/Welcome.jsx`; persona definitions live in `webos/src/os/personas.js`. Improve rather than replace these foundations.

### Welcome flow

- Make the first run a short, skippable wizard: (1) choose a look, (2) choose a workflow starter set, (3) understand browser/PWA limits and local data, (4) enter desktop.
- Preserve the fast path: one click to accept defaults and enter; no account or network requirement.
- Include “Preview”, “Use this layout”, “Keep current settings”, and “Choose later” semantics. Preview must not destructively overwrite a user's existing settings.
- Add a persistent “Run setup again” entry in Settings/About, plus a separate “Reset appearance” action that does not wipe files or app data.
- Store wizard completion/version separately from the persona ID so future onboarding steps can be introduced without repeatedly interrupting existing users.
- Respect `?open=` deep links and keyboard-only use. Manage focus, Escape behavior, screen-reader announcements, reduced motion, and focus restoration.
- Explain local-first behavior in plain language: what is stored in browser storage, how to export/backup it, and what is lost in private browsing or when site data is cleared.

### Persona catalogue

- Retain and refine Windows, macOS-inspired, GNOME/Linux, Tiling WM, Android/Material, and Omarchy/TUI presets.
- Clearly describe each as a **visual/workflow preset**, not an official or exact clone of the named OS. Use original/licensed assets and avoid implying affiliation.
- Add a light/dark/system preference independent of persona; make accent and density adjustable after selection.
- Offer optional starter layouts (Creator, Developer, Research, General productivity) as a separate choice from visual persona. Starter layouts pin apps/widgets but must not silently install apps or request permissions.
- Verify persona application behavior: taskbar side/alignment, theme, accent, typography, focus ring and contrast. Switching persona should not reset wallpaper, files, browser tabs, or installed apps unless the user explicitly chooses “apply all defaults.”

**Acceptance tests:** first run appears once; returning users are not interrupted; setup can be reopened; cancel/skip paths work; deep links remain functional; state persists across reload; keyboard and screen-reader flows work; switching presets preserves unrelated user data.

## Phase 2 — Fit, finish, accessibility, and resilience (P1)

- Establish a consistent design-token system for spacing, typography, radii, elevation, motion, and focus. Keep persona-specific overrides small and testable.
- Audit all shell surfaces at narrow mobile widths, tablet widths, high-DPI/zoom, light/dark themes, reduced motion, and keyboard-only input.
- Standardize loading, empty, offline, permission-denied, quota-exceeded, unsupported-browser, and recoverable-error states across apps.
- Make window behavior predictable: focus order, z-index, minimize/restore, snapping, resize handles, close confirmation for dirty documents, and taskbar indicators.
- Add crash recovery for shell/app failures without losing unsaved editor/notepad content; clearly distinguish recoverable state from guaranteed persistence.
- Improve storage UX: quota estimate where available, used-space display, export/import, per-app storage explanation, and explicit destructive confirmation. IndexedDB/browser storage is not a guaranteed disk.
- Validate all external app manifests, icon sources, URLs, and navigation destinations. External apps must not gain shell privileges merely because they are catalogued.
- Add visual regression snapshots for the welcome dialog, desktop, start menu, settings, browser states, file manager, and mobile drawer.

**Acceptance tests:** WCAG 2.2 AA for core flows, existing contrast tests remain enforced, no uncaught shell-level exceptions in the e2e sweep, no data loss on recoverable app crashes, and no hardcoded persona colors bypass design tokens.

## Phase 3 — Browser/runtime security and capability adapters (P0/P1)

- Keep the browser-hosted runtime constrained to normal web-platform permissions.
- Introduce a small capability interface (e.g. `storage`, `externalNavigation`, `notifications`, `nativeFiles`, `nativeBrowser`, `systemInfo`, `update`) with feature detection and explicit unavailable states.
- Treat iframe content and remote web apps as untrusted. Do not inject them into the shell's origin with privileged storage access.
- Prefer direct navigation or a separate-origin isolated browsing context for sites that prohibit framing. Be honest when a site cannot run embedded.
- Native runtime messages must be schema-validated, origin-checked, permission-scoped, and unable to invoke arbitrary commands. Keep secrets and privileged APIs out of renderer-side JavaScript.
- Define CSP, permissions policy, safe external-link handling, dependency pinning, and threat-model documentation before broad release.

**Acceptance tests:** hostile iframe/proxy fixtures cannot read shell localStorage/IndexedDB or invoke native capabilities; navigation and redirect tests pass; native bridge rejects malformed, unauthorized, replayed, and oversized messages.

## Phase 4 — App ecosystem and productivity value (P2)

- Define a versioned app manifest schema: ID, version, category, permissions, storage needs, entry point, update source, license, publisher, integrity hash, and supported runtimes.
- Separate first-party bundled apps, trusted catalog entries, and user-added URLs visually and in policy.
- Add install/update/uninstall lifecycle and compatibility checks; never execute catalog-provided code with native privileges by default.
- Prioritize core productivity workflows: files, notes, calendar/tasks, terminal/editor, calculator, media/PDF viewing, settings, and backups. Measure real workflow completion rather than app count.
- Add import/export and backup/restore for user data; document the limits of syncing browser storage across devices.
- Add an offline mode that clearly shows which apps/assets are cached and which require network access.

**Acceptance tests:** catalog validation, integrity checks, offline fallback, install/uninstall persistence, and export/restore round trips are automated.

## Phase 5 — Native desktop and OS distribution (separate TaskWizerOS track) (P1/P2)

ArtCraft WebOS should remain portable. TaskWizerOS is the appropriate home for the native CEF runtime, Linux packaging, and bootable ISO.

### Runtime and distribution

- Publish a support matrix with separate rows for hosted WebOS/PWA, native Linux desktop, live ISO, installed Linux system, and future Windows/macOS/Android targets.
- Keep native browser engine updates on a documented cadence and treat every Chromium security update as urgent; upstream documents weekly security refreshes and a two-week stable milestone cycle. Track the exact CEF/Chromium revision and the mapping from upstream security fixes to shipped artifacts.
- Ship only tested, reproducible artifacts with SBOM/license inventory, checksums, provenance, release notes, and rollback instructions.
- Ensure native launch uses a real browser engine with sandbox enabled; do not treat an iframe or WASM browser experiment as equivalent to a full browser.
- Keep privileged OS APIs behind the native host, not in the shared WebOS shell.

### ISO and installer

- Define separate **live session**, **installer**, and **installed-system** contracts. A live ISO booting successfully does not prove installation, upgrade, recovery, or persistence works.
- Select the base distribution and boot/update strategy before adding filesystem features. Evaluate Btrfs subvolumes, compression, snapshots, rollback, encrypted volumes, disk-full behavior, and recovery. Btrfs is an installed-system filesystem decision; it does not by itself provide an installer or safe rollback.
- Implement a disk-layout plan and installer UX that clearly identifies target disks, supports cancellation, detects low space, handles UEFI/GPT and legacy cases according to the support matrix, and never writes to disks before explicit confirmation.
- Test live boot and installed boot separately under BIOS/UEFI as supported; test Secure Boot claims only when the actual boot chain is signed and validated.
- For Btrfs, specify subvolume layout (system/root, home, snapshots, var/log or equivalent), snapshot retention, bootloader integration, atomic-update semantics, rollback recovery, and backup caveats. Do not promise automatic rollback until it is exercised end-to-end.
- Add QEMU smoke tests for boot, install, reboot, preserve user data on upgrade, uninstall/recovery behavior, and filesystem/mount audit. Keep destructive installer tests confined to disposable virtual disks.

**Acceptance tests:** artifact matrix has no ambiguous statuses; ISO is checksummed and reproducible; BIOS/UEFI boot tests match claims; installer cannot touch host disks in CI; installed system boots, updates, and recovers from a simulated failed update; Btrfs snapshot/rollback tests prove the documented contract.

## Phase 6 — Release engineering and operations (P1)

- Pin toolchains and build containers; capture build inputs and artifact digests.
- Run lint, unit/integration, coverage, accessibility, e2e, security, license/SBOM, packaging, install/upgrade, and boot smoke gates.
- Generate checksums and provenance; sign release artifacts where keys can be protected; never place signing secrets in repository or pull-request workflows.
- Stage rollouts where applicable, keep previous known-good artifacts, and document rollback.
- Publish support policy, known limitations, privacy/data-storage model, security reporting path, and contribution instructions.
- Track operational metrics without collecting personal browsing content: startup success, crash category, update result, and anonymized performance opt-in only.

## Suggested execution order

1. Resolve or disable the same-origin browser proxy risk (#12).
2. Land and validate the existing repository-readiness documentation/metadata changes.
3. Improve welcome/persona onboarding and add accessibility/persistence tests.
4. Complete shell resilience and storage export/restore.
5. Formalize runtime capability interfaces and threat model.
6. In TaskWizerOS, specify and implement the Btrfs installed-system contract plus installer plan; test in disposable VMs.
7. Close artifact provenance, release/update/rollback, and supported-platform documentation gaps.

## Out of scope for a single PR

- Rewriting Chromium or building a browser engine in WebAssembly.
- Claiming native OS, full browser, cross-device sync, Secure Boot, installer, or Btrfs rollback support without verified implementation.
- Deploying production changes or publishing an ISO as a side effect of a documentation/roadmap PR.

## Research references

- Chromium release cycle and security-refresh cadence: https://github.com/chromium/chromium/blob/main/docs/process/release_cycle.md
- Chromium security updates: https://github.com/chromium/chromium/blob/main/docs/security/updates.md
- Chromium Linux build requirements and upstream build/update workflow: https://github.com/chromium/chromium/blob/main/docs/linux/build_instructions.md
- TaskWizerOS live ISO operating contract: https://github.com/aliasfoxkde/TaskWizerOS/blob/main/docs/operations/live-iso.md
- TaskWizerOS native Linux operating contract: https://github.com/aliasfoxkde/TaskWizerOS/blob/main/docs/operations/native-linux.md
- TaskWizerOS release support matrix: https://github.com/aliasfoxkde/TaskWizerOS/blob/main/docs/release/matrix.md
