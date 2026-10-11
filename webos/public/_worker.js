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
//
// Navigation rewriting: anchors and form actions in proxied HTML are
// rewritten to stay inside the proxy (classic CGI-proxy behavior) — otherwise
// the first click navigates the frame straight to the real origin, whose
// framing guards blank it again. Form POSTs are forwarded with their body.

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

function httpUrl(raw) {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol)) throw new Error('scheme');
  return u;
}

/* Rewrite anchors and form actions so navigation stays proxied. Absolute,
   protocol-relative, and site-relative targets are wrapped; #frag
   (same-document) and non-http schemes are left alone. */
function rewriteNav(html, baseUrl) {
  const attr = (tagRe) => (m, lead, quote, raw) => {
    if (raw.startsWith('#')) return m; // same-document navigation
    let abs;
    try { abs = new URL(raw, baseUrl); } catch { return m; }
    if (!/^https?:$/.test(abs.protocol)) return m; // javascript:, mailto:, …
    const path = tagRe === 'a'
      ? `/proxy?url=${encodeURIComponent(abs.href)}`
      : `/proxy/form?url=${encodeURIComponent(abs.href)}`;
    return `${lead}${quote}${path}${quote}`;
  };
  return html
    .replace(/(<a\b[^>]*?\bhref=)(["'])([\s\S]*?)\2/gi, attr('a'))
    .replace(/(<form\b[^>]*?\baction=)(["'])([\s\S]*?)\2/gi, attr('form'));
}

async function proxyResponse(request, targetUrl) {
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

  // form POSTs arriving via /proxy/form are forwarded with their body intact
  const isPost = request.method === 'POST';
  let postBody;
  if (isPost) {
    postBody = await request.text();
    const ct = request.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
  }

  let resp;
  try {
    resp = await fetch(targetUrl, {
      method: isPost ? 'POST' : 'GET',
      body: postBody,
      headers,
      redirect: 'follow',
    });
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
    // the real site (CSS, images, scripts) instead of our origin; the nav
    // rewrite keeps link and form navigation inside the proxy instead.
    const body = await resp.text();
    // Workers' fetch() always populates resp.url; fall back to the requested
    // target if a runtime ever hands us a blank one.
    const finalUrl = resp.url || String(targetUrl);
    const rewritten = rewriteNav(body, finalUrl);
    const base = `<base href="${finalUrl}">`;
    const head = /<head[^>]*>/i.exec(rewritten);
    const injected = head
      ? rewritten.slice(0, head.index + head[0].length) + base + rewritten.slice(head.index + head[0].length)
      : base + rewritten;
    return new Response(injected, { status: resp.status, headers: out });
  }
  return new Response(resp.body, { status: resp.status, headers: out });
}

export default {
  async fetch(request) {
    const u = new URL(request.url);

    // A GET form inside a proxied page lands here: the rewritten action
    // carries the target URL and the form's fields arrive as sibling query
    // params. Re-fold the fields into the target, then proxy as usual.
    if (u.pathname === '/proxy/form') {
      const fold = new URLSearchParams();
      for (const [k, v] of u.searchParams) if (k !== 'url') fold.append(k, v);
      let inner;
      try {
        inner = httpUrl(u.searchParams.get('url') ?? '');
      } catch {
        return json('url parameter must be an http(s) URL', 400);
      }
      const qs = fold.toString();
      if (qs) inner.search = inner.search ? `${inner.search.slice(1)}&${qs}` : qs;
      return proxyResponse(request, inner);
    }

    if (u.pathname !== '/proxy') return json('not found', 404);
    try {
      return await proxyResponse(request, httpUrl(u.searchParams.get('url') ?? ''));
    } catch {
      return json('url parameter must be an http(s) URL', 400);
    }
  },
};
