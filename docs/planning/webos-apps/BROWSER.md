# WebOS Browser Surface

`webos/src/apps/browser/` is the browser-style browsing surface inside the
WebOS desktop. It provides tabs, per-tab navigation history, an address bar,
keyboard shortcuts, official embed endpoints, and cross-origin iframe
rendering where the destination site permits it.

## Important runtime distinction

The hosted WebOS shell is a browser application. Its in-window browser is
currently an iframe-based browsing surface, **not an independent Chromium
browser engine**. A web page cannot bypass the destination site's
`X-Frame-Options`, CSP `frame-ancestors`, same-origin policy, or CORS rules.

TaskWizerOS is the native runtime track. Its CEF/Chromium-backed desktop is
the correct place to deliver full browser-engine functionality, real browser
profiles, unrestricted top-level navigation, native downloads, extension
support, and system integration.

## Rendering modes

1. **embed** — official embed endpoints published by the destination, such as
   YouTube's privacy-enhanced embed and Spotify's embed player.
2. **direct** — a normal cross-origin iframe. It works only when the site
   allows framing and its functionality does not require its own origin.
3. **external** — an explicit hand-off to a normal browser tab when the site
   blocks framing, requires its own origin, or cannot function inside a frame.

There is deliberately no same-origin proxy mode.

## Why the same-origin proxy was removed

The previous Pages Function fetched arbitrary remote HTML, removed framing
and isolation headers, and returned the result from the WebOS origin. That
made untrusted remote scripts execute as same-origin code with access to the
WebOS origin's storage. An Origin check alone cannot turn arbitrary remote
HTML into trusted shell content; redirects, script execution, and navigation
make the boundary unsafe.

The proxy worker now returns HTTP 410 for every request and never fetches or
returns remote content. URL classification no longer creates proxy URLs or
honors saved proxy-mode overrides. Restored sessions are reclassified from
their original destination URL, so legacy proxy entries cannot revive the old
behavior.

Do not reintroduce remote HTML rewriting on the WebOS origin. A future
compatibility feature must use a separately isolated origin with a reviewed
threat model, strict navigation policy, and adversarial tests. Otherwise use
the native browser runtime or external hand-off.

## Chromium-style surface

- Tab strip with favicons and close/new-tab controls.
- Per-tab history with forward-stack truncation.
- Address bar: full URLs pass through, bare hosts upgrade to HTTPS,
  localhost uses HTTP, and other text becomes a Bing search URL.
- Keyboard: Ctrl/Meta+T opens a tab, Ctrl/Meta+W closes one, Ctrl/Meta+L
  focuses the address bar, Ctrl/Meta+R and F5 reload, Ctrl/Tab cycles tabs,
  and Alt+Left/Right navigates history.
- Session restore stores tab URLs locally. Tab sessions remain device-local;
  they are not intended to sync browsing history across devices.
- A blocked frame offers a real top-level browser tab hand-off.

## AI browser integration

Alibaba Page Agent's official extension API can automate the user's normal
browser tabs after explicit extension installation and token authorization.
It is an optional integration; it does not gain access to the Browser app's
cross-origin iframe contents. Its extension currently supports normal browser
windows, not PWA app windows. See `docs/planning/AI-FIRST-ARCHITECTURE.md`
for the capability boundary and privacy model.

## Launch integration

- `os.launch('browser', { url })` deep-links into a new Browser window.
- Single-instance launch focuses the existing window. Passing arguments to a
  running instance remains governed by the shell's launch lifecycle.
