// Same-origin rendering proxy for the WebOS Browser — a Cloudflare Pages
// Function deployed with the site (see _routes.json: only /proxy routes reach
// this worker; every other request is served straight from the static asset
// store, so the site stays free-tier static).
//
// Why this exists: when an <iframe> is blocked by X-Frame-Options or CSP
// frame-ancestors, the enforcement happens in the USER'S browser. No
// client-side trick can bypass it. Fetching the page server-side and serving
// it from our own origin is the legitimate escape hatch — our browser strips
// the framing guards before the user's browser ever sees them.
//
// Honest limits (documented in docs/planning/webos-apps/BROWSER.md):
//   - relative subresources work via <base href>, but pages that hardcode
//     absolute URLs for their APIs/XHR keep calling the real origin. For
//     sites whose client is inseparable from their API (Discord), CORS on
//     those calls is impassable — the Browser classifies those as external.
//   - authenticated surfaces degrade (we forward no cookies by design).

const STRIP = [
  // framing guards — the entire point of the proxy
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  // isolation headers that would break the same-origin frame relationship
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  // per-embedder state we must not leak or reuse
  'set-cookie',
  // transport framing is re-created by fetch()/Response
  'content-encoding',
  'content-length',
];

function json(err, status) {
  return new Response(JSON.stringify({ error: err }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request) {
    const u = new URL(request.url);
    if (u.pathname !== '/proxy') return json('not found', 404);

    const target = u.searchParams.get('url');
    let targetUrl;
    try {
      targetUrl = new URL(target ?? '');
      if (!/^https?:$/.test(targetUrl.protocol)) throw new Error('scheme');
    } catch {
      return json('url parameter must be an http(s) URL', 400);
    }

    // This endpoint exists for the WebOS app calling same-origin. Anything
    // cross-origin gets refused (blocks third-party free-riding on the Worker).
    const origin = request.headers.get('origin');
    if (origin) {
      const self = new URL(request.url).origin;
      if (origin !== self) return json('cross-origin proxying is refused', 403);
    }

    const headers = new Headers();
    const accept = request.headers.get('accept');
    if (accept) headers.set('accept', accept);
    const ua = request.headers.get('user-agent');
    if (ua) headers.set('user-agent', ua);
    headers.set('referer', targetUrl.origin + '/');

    let resp;
    try {
      resp = await fetch(targetUrl, { headers, redirect: 'follow' });
    } catch {
      return json('upstream fetch failed', 502);
    }

    const out = new Headers(resp.headers);
    for (const h of STRIP) out.delete(h);
    // let the browser chrome show the post-redirect location
    out.set('x-proxied-url', resp.url);
    out.set('referrer-policy', 'no-referrer');

    const type = resp.headers.get('content-type') ?? '';
    if (type.includes('text/html')) {
      // <base href> makes the page's relative subresources resolve against
      // the real site (CSS, images, scripts) instead of our origin.
      const body = await resp.text();
      const base = `<base href="${resp.url}">`;
      const head = /<head[^>]*>/i.exec(body);
      const injected = head
        ? body.slice(0, head.index + head[0].length) + base + body.slice(head.index + head[0].length)
        : base + body;
      return new Response(injected, { status: resp.status, headers: out });
    }
    return new Response(resp.body, { status: resp.status, headers: out });
  },
};
