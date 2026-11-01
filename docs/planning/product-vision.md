# ArtCraft WebOS: product vision and roadmap

**Status reviewed:** 2026-11-01  
**Current implementation:** experimental browser desktop prototype  
**Roadmap tracking:** [GitHub issue #13](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/13)

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
disk. It bundles companion creative applications and provides a terminal
with WebAssembly-based utilities. Browser storage stays in the current
browser profile.

The repository's [quickstart](../getting-started/quickstart.md),
[app guide](../getting-started/apps.md), and
[architecture overview](../architecture/overview.md) describe the current
implementation. The live prototype is at
[artcraft-webos.pages.dev](https://artcraft-webos.pages.dev/).

## Gaps that define the roadmap

- There is no native bootable image or supported hardware matrix.
- There is no user identity, cross-device session, or cloud synchronization.
- WebAssembly support is not an arbitrary binary upload-and-run sandbox.
- The app collection does not yet replace the range of tools people need
  for everyday computing.
- The browser proxy has an open isolation issue; sensitive sign-in through
  proxied pages is not safe to recommend until that issue is resolved.
- AI-assisted app authoring and contribution workflows are not implemented.

## Phased roadmap

### 1. Make the browser prototype safe and dependable

Resolve the [proxy isolation issue](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/12),
document the browser security boundary, and keep local data export and
recovery understandable. Establish release checks for app provenance,
storage compatibility, browser support, and accessibility. Do not add
account or sync features before the local data model and threat model are
clear.

**Exit evidence:** the proxy has a reviewed origin and content-isolation
model; regression tests cover the boundary; users can understand and
recover their local data; release checks record the tested browser and app
versions.

### 2. Grow useful daily workflows

Prioritize coherent workflows over a large app count: writing and files,
web research, media, communication, development, and creative work. Improve
keyboard and assistive-technology support, offline behavior, import/export,
and predictable persistence. Test workflows across desktop and mobile
browsers.

**Exit evidence:** each supported workflow has documented limits,
end-to-end tests, keyboard coverage, and a reliable data export path.

### 3. Define a safe app and WASM package model

Before supporting user-supplied binaries, specify app manifests,
capabilities, permissions, resource limits, origin isolation, storage
ownership, package provenance, signing, and revocation. Build a disposable
test environment for packages and make the permission grants visible to
users. Keep bundled companion apps working through the same documented
contracts where practical.

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

Let AI help explain settings, build customizations, and draft apps or
fixes. Show file changes and required permissions before applying them.
Run tests and security checks, then prepare an issue or pull request for
human review. Separate local execution from publishing, deployment, and
access to user data.

**Exit evidence:** permission-scoped tools, visible diffs, reproducible
checks, attribution, and explicit approval before external publication.

### 6. Explore a native and bootable system

Treat an ISO or native image as a separate architecture project. First
define supported hardware, boot and recovery paths, secure updates,
encryption, drivers, power management, and how the browser shell relates
to the host operating system. Prototype on virtual machines before
promising broad hardware support.

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

This document describes product direction. The
[GitHub roadmap issue](https://github.com/aliasfoxkde/ArtCraft-WebOS/issues/13)
tracks project-level work; implementation status belongs in the relevant
code, tests, and release notes. Update this document when the product
scope or phase ordering changes.
