# The WebOS Browser

`src/apps/browser/` — a Chromium-style browser that runs as a bundled plugin
window: tab strip with per-tab history, smart address bar, keyboard model,
and a four-mode rendering stack that is honest about what the web platform
allows.

## The X-Frame-Options question, answered precisely

When a site sends `X-Frame-Options: DENY` (or CSP `frame-ancestors`, which
supersedes it), the *user's browser* refuses to paint that site inside an
`<iframe>`. This is enforced client-side at render time; no amount of
client-side code — attributes, postMessage tricks, referrer surgery — can
bypass it. Anyone claiming otherwise is selling a blocked frame that silently
renders nothing.

There is exactly one legitimate escape hatch: **fetch the page server-side
and serve it from your own origin.** The framing guards are stripped before
the user's browser ever evaluates them. WebOS does this with a Cloudflare
Pages Function (`webos/public/_worker.js`, scoped to `/proxy` by
`_routes.json` so every other request stays a free static-asset hit).

What the proxy honestly can and cannot do:

| Works through the proxy | Does not |
| --- | --- |
| Reading/browsing server-rendered or statically-hosted sites (docs, news, wikis) | Clients whose API calls are CORS-gated to their own origin (Discord) — the page loads but every request it makes to `discord.com/api` from a foreign origin is blocked by the browser, not by us |
| Relative subresources (CSS/JS/images), via injected `<base href>` | OAuth flows (Google sign-in etc.) — framebusting + COOP by design |
| Sites that merely send framing headers but don't check origin | Cookies (not forwarded, by design — the proxy is stateless and anonymous) |
| | Absolute-URL navigation inside the page (jumps out of the proxy; the frame then hits the real site's framing guard) |

## The four rendering modes

`urls.js` classifies every navigation into one mode (per-host user overrides
from the toolbar shield beat the tables):

1. **embed** — the site *publishes* an embed endpoint and wants to be framed.
   YouTube share links rewrite to `youtube-nocookie.com/embed/<id>`, Spotify
   to `open.spotify.com/embed/<type>/<id>`. Zero tricks; best fidelity.
2. **direct** — plain iframe. Frame-friendly sites (Excalidraw, tldraw,
   Photopea, Wikipedia, HN, …) and the default for unknown hosts.
3. **proxy** — served through `/proxy?url=…`. One click on the address-bar
   shield flips a blank direct frame to proxied; the per-host choice is
   remembered in `webos.browser.modes`.
4. **external** — structurally impossible in any frame (Discord is the
   canonical case: its client is inseparable from its own-origin API). The
   window shows *why*, with a real hand-off to a system tab — no fake
   loading states, no silent blank frame.

Search defaults to Bing (`www.bing.com/search?q=`) fetched through the
proxy — Bing serves real SERPs to datacenter fetches, while DuckDuckGo's
HTML endpoint bot-challenges them with a captcha (DDG hosts still route
through the proxy if you navigate there directly).

### Staying inside the proxy

A proxied page whose links point at the real origin would blank itself on
the first click (the target's framing guards are still there). So
`_worker.js` rewrites proxied HTML the classic CGI-proxy way:

- `<a href>` — absolute, protocol-relative, and site-relative targets are
  wrapped as `/proxy?url=…`; `#fragment` and non-http schemes stay as
  authored. The author's quote character is preserved.
- `<form action>` — rewritten to `/proxy/form?url=…`. GET form fields arrive
  as sibling query params and the worker re-folds them into the target URL
  (so searching again from inside a proxied Bing works); POST bodies are
  forwarded with their content type.
- `<base href>` (the post-redirect URL) is injected as the first element of
  `<head>`, which is what makes relative subresources (CSS, images, scripts)
  load from the real site — framing headers never apply to subresources.
- What is NOT rewritten: API/XHR URLs inside page JavaScript, and
  service workers. Sites whose client is inseparable from their origin API
  remain `external`.

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
  on relaunch.
- Status bar shows the real current URL and, for direct frames, a hint about
  the proxy shield.

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
picks them up. Only `/proxy` invokes the Worker (see `_routes.json`) — the
same-origin check inside the worker refuses cross-origin callers. Local dev
against the proxy needs `wrangler pages dev` (vite dev serves no Functions);
without it, proxy-mode tabs show the error JSON the worker would return.
