// URL intelligence for the Browser app. Remote sites are only embedded when
// they permit cross-origin framing; otherwise the user is handed off to a
// normal browser tab. No remote HTML is fetched and re-served from this origin.
export const SEARCH_URL = 'https://www.bing.com/search?q=';

const HOST_ALIASES = {
  'youtube.com': 'youtube.com', 'www.youtube.com': 'youtube.com',
  'm.youtube.com': 'youtube.com', 'music.youtube.com': 'youtube.com',
  'youtu.be': 'youtube.com', 'open.spotify.com': 'spotify.com',
};
const hostKey = (url) => HOST_ALIASES[hostOf(url)] ?? hostOf(url);
const DIRECT_HOSTS = new Set([
  'excalidraw.com', 'tldraw.com', 'photopea.com', 'squoosh.app',
  'sqliteviewer.app', 'online-python.com', 'archive.org', 'en.wikipedia.org',
  'wikipedia.org', 'news.ycombinator.com',
]);
const EXTERNAL_HOSTS = new Map([
  ['discord.com', 'Discord’s client calls discord.com/api from inside the page. Browser CORS rules only allow those calls from discord.com itself, so neither an iframe nor a proxy can run it here.'],
  ['accounts.google.com', 'Google sign-in actively blocks being framed. Authentication must happen in a normal browser tab.'],
  ['facebook.com', 'Facebook requires its own origin for authentication and API calls; use a normal browser tab.'],
  ['instagram.com', 'Instagram requires its own origin for authentication and API calls; use a normal browser tab.'],
  ['x.com', 'X requires its own origin for authentication and API calls; use a normal browser tab.'],
  ['twitter.com', 'X requires its own origin for authentication and API calls; use a normal browser tab.'],
  ['www.bing.com', 'Search-engine result pages may block iframe embedding. Open the search in a normal browser tab.'],
  ['bing.com', 'Search-engine result pages may block iframe embedding. Open the search in a normal browser tab.'],
  ['html.duckduckgo.com', 'Search-engine result pages may block iframe embedding. Open the search in a normal browser tab.'],
  ['lite.duckduckgo.com', 'Search-engine result pages may block iframe embedding. Open the search in a normal browser tab.'],
]);

export function rewriteEmbed(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const h = hostKey(url);
  if (h === 'youtube.com') {
    if (/^\/(?:watch|shorts|embed)\/?$/.test(u.pathname) && u.searchParams.get('v')) {
      return `https://www.youtube-nocookie.com/embed/${u.searchParams.get('v')}`;
    }
    const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    if (u.hostname === 'youtu.be' && /^\/[\w-]{6,}/.test(u.pathname)) {
      return `https://www.youtube-nocookie.com/embed${u.pathname}`;
    }
    if (u.searchParams.get('list')) {
      return `https://www.youtube-nocookie.com/embed/videoseries?list=${u.searchParams.get('list')}`;
    }
    return null;
  }
  if (h === 'spotify.com') {
    const m = u.pathname.match(/^\/(track|album|playlist|artist|episode|show)\/([\w]+)/);
    return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null;
  }
  return null;
}

export function normalizeAddress(input) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.href : null; }
    catch { return null; }
  }
  let candidate = null;
  if (/^localhost(:\d+)?(\/\S*)?$/i.test(s)) candidate = `http://${s}`;
  else if (/^[a-z0-9.-]+(:\d+)?(\/\S*)?$/i.test(s) && /^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) candidate = `https://${s}`;
  if (candidate) { try { return new URL(candidate).href; } catch { /* search below */ } }
  return SEARCH_URL + encodeURIComponent(s);
}

export function classify(url) {
  const embed = rewriteEmbed(url);
  if (embed) return { mode: 'embed', src: embed, url };
  const host = hostKey(url);
  if (EXTERNAL_HOSTS.has(host)) return { mode: 'external', url, reason: EXTERNAL_HOSTS.get(host) };
  if (DIRECT_HOSTS.has(host)) return { mode: 'direct', src: url, url };
  return { mode: 'direct', src: url, url };
}

export function hostOf(url) {
  if (!url) return '';
  try { return new URL(url, location.href).hostname; } catch { return ''; }
}
export function displayUrl(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
export function titleFor(url) {
  const host = hostOf(url);
  return host ? host.replace(/^www\./, '') : 'New tab';
}
