// URL intelligence for the Browser app: turn whatever the user typed into a
// navigable URL, and classify how a site can render inside a WebOS window.
//
// Modes (how the honest-embed stack works, best to worst):
//   embed    — the site publishes an official embed endpoint (YouTube's
//              /embed/, Spotify's /embed/); designed for iframes, zero tricks.
//   direct   — plain <iframe src>. Works for frame-friendly sites; when a
//              site answers with X-Frame-Options/CSP frame-ancestors the
//              iframe just fails to paint, and the user can flip to proxy.
//   proxy    — same-origin /proxy?url=… (public/_worker.js): a Pages Function
//              fetches the site server-side and strips the framing headers
//              where enforcement actually happens. Full-fidelity apps that
//              call their own API cross-origin (Discord) still can't work —
//              that's what `external` is for.
//   external — structurally impossible in any frame (cross-origin APIs are
//              CORS-gated to the site's own origin, OAuth does framebusting).
//              We say so and hand off to a real browser tab.

export const SEARCH_URL = 'https://www.bing.com/search?q=';
export const PROXY_PATH = '/proxy';

/* Search engines are fetched server-side (they all send framing guards, and
   the proxied page keeps working: links and the search form are rewritten to
   stay inside the proxy by _worker.js). Bing is the default — DDG's html
   endpoint bot-challenges datacenter egress IPs with a captcha. */
const SEARCH_HOSTS = new Set(['www.bing.com', 'bing.com', 'html.duckduckgo.com', 'lite.duckduckgo.com']);

/* Sites that are known frame-friendly — plain iframe, no negotiation. */
const DIRECT_HOSTS = new Set([
  'excalidraw.com', 'tldraw.com', 'photopea.com', 'squoosh.app',
  'sqliteviewer.app', 'online-python.com', 'archive.org',
  'en.wikipedia.org', 'wikipedia.org', 'news.ycombinator.com',
]);

/* Sites where framing AND proxying are structurally hopeless: their page
   boots a client that calls the site's own API cross-origin, which browser
   CORS blocks from any foreign origin — proxy or not. */
const EXTERNAL_HOSTS = new Map([
  ['discord.com', 'Discord’s client calls discord.com/api from inside the page. Browser CORS rules only allow those calls from discord.com itself, so neither an iframe nor a proxy can ever run it here.'],
  ['accounts.google.com', 'Google sign-in actively blocks being framed (COOP/framebusting) — authentication must happen in a real tab.'],
  ['facebook.com', 'Facebook requires its own origin for auth and API calls; a frame or proxy cannot host it.'],
  ['instagram.com', 'Instagram requires its own origin for auth and API calls; a frame or proxy cannot host it.'],
  ['x.com', 'X requires its own origin for auth and API calls; a frame or proxy cannot host it.'],
  ['twitter.com', 'X requires its own origin for auth and API calls; a frame or proxy cannot host it.'],
]);

const HOST_ALIASES = {
  'youtube.com': 'youtube.com',
  'www.youtube.com': 'youtube.com',
  'm.youtube.com': 'youtube.com',
  'music.youtube.com': 'youtube.com',
  'youtu.be': 'youtube.com',
  'open.spotify.com': 'spotify.com',
};

const hostKey = (url) => HOST_ALIASES[hostOf(url)] ?? hostOf(url);

/* Official embed endpoints, rewritten from ordinary share links. */
export function rewriteEmbed(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const h = hostKey(url);
  if (h === 'youtube.com') {
    let m;
    if ((m = u.pathname.match(/^\/(?:watch|shorts|embed)\/?(?:\?.*)?$/)) && u.searchParams.get('v')) {
      return `https://www.youtube-nocookie.com/embed/${u.searchParams.get('v')}`;
    }
    if ((m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/))) {
      return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    }
    if (u.hostname === 'youtu.be' && /^\/[\w-]{6,}/.test(u.pathname)) {
      return `https://www.youtube-nocookie.com/embed${u.pathname}`;
    }
    if (u.searchParams.get('list')) {
      return `https://www.youtube-nocookie.com/embed/videoseries?list=${u.searchParams.get('list')}`;
    }
    return null; // channel/feature pages have no embed form
  }
  if (h === 'spotify.com') {
    const m = u.pathname.match(/^\/(track|album|playlist|artist|episode|show)\/([\w]+)/);
    return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null;
  }
  return null;
}

/* Free-text address bar → a URL (or a search). */
export function normalizeAddress(input) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  // bare host (optionally with path/port): example.com, example.com/a?b, localhost:3000
  let candidate = null;
  if (/^localhost(:\d+)?(\/\S*)?$/i.test(s)) candidate = `http://${s}`;
  else if (/^[a-z0-9.-]+(:\d+)?(\/\S*)?$/i.test(s) && /^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) {
    candidate = `https://${s}`;
  }
  if (candidate) {
    try { return new URL(candidate).href; } catch { /* not a real host → search */ }
  }
  return SEARCH_URL + encodeURIComponent(s);
}

/* How should this URL render? `override` (host → 'direct' | 'proxy') is the
   user's per-site choice from the toolbar; it wins over the tables. */
export function classify(url, override) {
  const embed = rewriteEmbed(url);
  if (embed) return { mode: 'embed', src: embed, url };
  const host = hostKey(url);
  if (override === 'proxy') return { mode: 'proxy', src: proxyWrap(url), url };
  if (override === 'direct') return { mode: 'direct', src: url, url };
  if (EXTERNAL_HOSTS.has(host)) return { mode: 'external', url, reason: EXTERNAL_HOSTS.get(host) };
  if (DIRECT_HOSTS.has(host)) return { mode: 'direct', src: url, url };
  if (SEARCH_HOSTS.has(host)) return { mode: 'proxy', src: proxyWrap(url), url };
  // unknown site: try it natively first — flip to proxy from the toolbar
  // if the frame stays blank (the site sent a framing guard).
  return { mode: 'direct', src: url, url };
}

export function proxyWrap(url) {
  return `${PROXY_PATH}?url=${encodeURIComponent(url)}`;
}

export function hostOf(url) {
  if (!url) return '';
  try {
    return new URL(url, location.href).hostname;
  } catch {
    return '';
  }
}

/* Address-bar text for a URL: hide the scheme, keep the path. */
export function displayUrl(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/* Tab title: the readable part of the host. */
export function titleFor(url) {
  const host = hostOf(url);
  if (!host) return 'New tab';
  return host.replace(/^www\./, '');
}
