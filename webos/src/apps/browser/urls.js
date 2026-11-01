// URL intelligence for the Browser app: turn whatever the user typed into a
// navigable URL, and classify how a site can render inside a WebOS window.
//
// Modes:
//   embed    — the site publishes an official embed endpoint (YouTube's
//              /embed/, Spotify's /embed/); designed for iframes, zero tricks.
//   direct   — plain <iframe src>. Works for frame-friendly sites; when a
//              site answers with X-Frame-Options/CSP frame-ancestors the
//              iframe just fails to paint.
//   external — cannot be framed from this origin (cross-origin APIs are
//              CORS-gated to the site's own origin, OAuth does framebusting,
//              or the site forbids embedding outright — search engines do).
//              We say so and hand off to a real browser tab.
//
// There is deliberately no `proxy` mode: the same-origin /proxy Pages
// Function served remote HTML from the WebOS origin, which let untrusted
// scripts reach shell storage (issue #12). It now fails closed.

export const SEARCH_URL = 'https://www.bing.com/search?q=';

/* Sites that cannot be framed from this origin. Search engines are here
   because they send framing guards on their result pages; without a
   server-side fetch there is no way to render them in a frame. */
const EXTERNAL_HOSTS = new Map([
  ['discord.com', 'Discord’s client calls discord.com/api from inside the page. Browser CORS rules only allow those calls from discord.com itself, so an iframe cannot run it here.'],
  ['accounts.google.com', 'Google sign-in actively blocks being framed (COOP/framebusting) — authentication must happen in a real tab.'],
  ['facebook.com', 'Facebook requires its own origin for auth and API calls; a frame cannot host it.'],
  ['instagram.com', 'Instagram requires its own origin for auth and API calls; a frame cannot host it.'],
  ['x.com', 'X requires its own origin for auth and API calls; a frame cannot host it.'],
  ['twitter.com', 'X requires its own origin for auth and API calls; a frame cannot host it.'],
  ['www.bing.com', 'Search result pages forbid iframe embedding. Open the search in a normal browser tab.'],
  ['bing.com', 'Search result pages forbid iframe embedding. Open the search in a normal browser tab.'],
  ['html.duckduckgo.com', 'Search result pages forbid iframe embedding. Open the search in a normal browser tab.'],
  ['lite.duckduckgo.com', 'Search result pages forbid iframe embedding. Open the search in a normal browser tab.'],
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

/* How should this URL render? */
export function classify(url) {
  const embed = rewriteEmbed(url);
  if (embed) return { mode: 'embed', src: embed, url };
  const host = hostKey(url);
  if (EXTERNAL_HOSTS.has(host)) return { mode: 'external', url, reason: EXTERNAL_HOSTS.get(host) };
  // everything else: try it natively — a site that forbids embedding needs a
  // normal browser tab.
  return { mode: 'direct', src: url, url };
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
