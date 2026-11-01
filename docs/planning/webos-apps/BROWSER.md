# The WebOS Browser

`src/apps/browser/` — a Chromium-style browser that runs as a bundled plugin
window: tab strip with per-tab history, smart address bar, keyboard model,
and a rendering stack that is honest about what the web platform allows.

## The X-Frame-Options question, answered precisely

When a site sends `X-Frame-Options: DENY` (or CSP `frame-ancestors`, which
supersedes it), the *user's browser* refuses to paint that site inside an
`<iframe>`. This is enforced client-side at render time; no amount of
client-side code — attributes, postMessage tricks, referrer surgery — can
bypass it. Anyone claiming otherwise is selling a blocked frame that silently
renders nothing.

There is exactly one technical escape hatch: **fetch the page server-side
and serve it from your own origin.** WebOS deliberately does NOT do this.
The historical `/proxy` Pages Function did, and it was removed (issue #12):
serving remote HTML from the WebOS origin made untrusted scripts same-origin
with the shell — they could read `localStorage`, IndexedDB, and any shell
bridge in the page's origin. Stripping framing guards for a foreign origin
is indistinguishable, from the sandbox model's point of view, from disabling
the sandbox. The endpoint now fails closed (a fixed 410, no fetch, no
rewrite); frame-hostile sites get the honest external hand-off instead. A
future isolated-origin compatibility service would need its own origin, its
own threat model, and adversarial validation before it could return.

## The three rendering modes

`urls.js` classifies every navigation into one mode:

1. **embed** — the site *publishes* an embed endpoint and wants to be framed.
   YouTube share links rewrite to `youtube-nocookie.com/embed/<id>`, Spotify
   to `open.spotify.com/embed/<type>/<id>`. Zero tricks; best fidelity.
2. **direct** — plain iframe. Frame-friendly sites (Excalidraw, tldraw,
   Photopea, Wikipedia, HN, …) and the default for unknown hosts. When the
   site answers with a framing guard the frame stays blank; the status bar
   says so and suggests a real tab.
3. **external** — cannot be framed from this origin: CORS-gated clients
   (Discord), OAuth flows (Google sign-in), and sites that simply forbid
   embedding (search engines — Bing and the DuckDuckGo HTML endpoints all
   send framing guards on their result pages). The window shows *why*, with
   a real hand-off to a system tab — no fake loading states, no silent
   blank frame.

Search defaults to Bing (`www.bing.com/search?q=`); since the proxy removal
a search opens the external hand-off page with a one-click system tab.

## Chromium parity surface

- Tab strip: rounded active tab, favicons (site `/favicon.ico` with letter-chip
  fallback), close buttons, `+` new tab; closing the last tab gives a fresh
  new-tab page instead of closing the window.
- Per-tab history with forward-stack truncation; every tab keeps its frame
  mounted (hidden when inactive) so tab state survives switching.
- Address bar: full URLs pass through, bare hosts upgrade to https,
  `localhost` to http, anything else searches. Esc restores the entry.
- Keyboard (capture-phase on the browser subtree; keys inside cross-origin
  frames are the frame's, by platform rule): `Ctrl+T` new tab, `Ctrl+W` close
  tab, `Ctrl+L` focus address, `Ctrl+R`/`F5` reload, `Ctrl+Tab`/`Ctrl+Shift+Tab`
  cycle tabs, `Alt+←`/`Alt+→` back/forward.
- Session restore: open tabs persist to `webos.browser.session` and come back
  on relaunch. Restored entries are reclassified from their original URLs —
  sessions saved by older builds (which stored `mode: 'proxy'` rows) cannot
  reactivate the removed mode.
- Status bar shows the real current URL and, for direct frames, a hint that
  a blank frame means the site forbids embedding.

## Launch integration

- `os.launch('browser', { url })` deep-links (new window). Launching the
  single-instance browser while it is open focuses it (args-passing to a
  running instance is a known follow-up).
- The App Store's web essentials (YouTube, Discord, Spotify, ChatGPT) keep
  their honest launch panels; the panel now offers "Open in the WebOS
  Browser" alongside the system-tab hand-off.

## Deploy notes

`_worker.js` + `_routes.json` live in `webos/public/` and ship verbatim into
`dist/` on build; `wrangler pages deploy dist --project-name artcraft-webos`
picks them up. Only `/proxy` and `/proxy/*` invoke the Worker (see
`_routes.json`), and it answers every request with the same fixed 410 JSON —
it never fetches remote content, so there is no same-origin check to bypass.
`tests/worker-proxy.test.js` pins the fail-closed contract, including a
never-touches-the-network assertion.
