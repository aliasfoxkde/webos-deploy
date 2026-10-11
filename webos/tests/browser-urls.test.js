// Browser URL intelligence: address normalization, embed rewrites for sites
// that publish official embed endpoints, and the embed/direct/proxy/external
// classification that decides how a site renders inside a WebOS window.
import { describe, it, expect } from 'vitest';
import {
  SEARCH_URL, normalizeAddress, rewriteEmbed, classify, proxyWrap, displayUrl, hostOf, titleFor,
} from '../src/apps/browser/urls.js';

describe('normalizeAddress', () => {
  it('passes full URLs through and upgrades bare hosts to https', () => {
    expect(normalizeAddress('https://example.com/a?b')).toBe('https://example.com/a?b');
    expect(normalizeAddress('http://example.com')).toBe('http://example.com'); // as typed
    expect(normalizeAddress('example.com')).toBe('https://example.com/');
    expect(normalizeAddress('example.com/path?q=1')).toBe('https://example.com/path?q=1');
    expect(normalizeAddress('localhost:3000/x')).toBe('http://localhost:3000/x');
  });

  it('searches free text; empty input is a no-op', () => {
    expect(normalizeAddress('cat pictures')).toBe(SEARCH_URL + 'cat%20pictures');
    expect(normalizeAddress('example')).toBe(SEARCH_URL + 'example'); // no dot → not a host
    expect(normalizeAddress('')).toBe(null);
    expect(normalizeAddress('   ')).toBe(null);
    expect(normalizeAddress(null)).toBe(null);
  });
});

describe('rewriteEmbed', () => {
  it('rewrites every YouTube share shape to the nocookie embed player', () => {
    expect(rewriteEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(rewriteEmbed('https://youtu.be/dQw4w9WgXcQ?t=42'))
      .toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(rewriteEmbed('https://www.youtube.com/shorts/abcdefghijk'))
      .toBe('https://www.youtube-nocookie.com/embed/abcdefghijk');
    expect(rewriteEmbed('https://www.youtube.com/live/abcdefghijk'))
      .toBe('https://www.youtube-nocookie.com/embed/abcdefghijk');
    expect(rewriteEmbed('https://www.youtube.com/watch?list=PL1234abcd'))
      .toBe('https://www.youtube-nocookie.com/embed/videoseries?list=PL1234abcd');
  });

  it('rewrites Spotify share links; leaves channel/home pages alone', () => {
    expect(rewriteEmbed('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'))
      .toBe('https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT');
    expect(rewriteEmbed('https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3'))
      .toBe('https://open.spotify.com/embed/album/1DFixLWuPkv3KT3TnV35m3');
    expect(rewriteEmbed('https://www.youtube.com/')).toBe(null); // home has no embed
    expect(rewriteEmbed('https://example.com/watch?v=dQw4w9WgXcQ')).toBe(null);
    expect(rewriteEmbed('not a url')).toBe(null);
  });
});

describe('classify', () => {
  it('embed rewrites win over everything', () => {
    const c = classify('https://www.youtube.com/watch?v=abc12345678');
    expect(c.mode).toBe('embed');
    expect(c.src).toBe('https://www.youtube-nocookie.com/embed/abc12345678');
  });

  it('structurally-impossible sites explain themselves instead of failing silently', () => {
    const c = classify('https://discord.com/app');
    expect(c.mode).toBe('external');
    expect(c.reason).toMatch(/CORS/);
    expect(classify('https://accounts.google.com/signin').mode).toBe('external');
    expect(classify('https://x.com/home').mode).toBe('external');
  });

  it('known frame-friendly hosts go direct; search engines go through the proxy', () => {
    expect(classify('https://excalidraw.com/').mode).toBe('direct');
    expect(classify('https://en.wikipedia.org/wiki/Frame').mode).toBe('direct');
    const s = classify(SEARCH_URL + 'cats');
    expect(s.mode).toBe('proxy');
    expect(s.src).toBe(proxyWrap(SEARCH_URL + 'cats'));
    // every search host routes through the proxy, whichever way you get there
    expect(classify('https://www.bing.com/search?q=cats').mode).toBe('proxy');
    expect(classify('https://html.duckduckgo.com/html/?q=cats').mode).toBe('proxy');
  });

  it('a per-host user override beats the tables; unknown hosts try direct first', () => {
    expect(classify('https://github.com/trending', 'proxy').mode).toBe('proxy');
    expect(classify('https://github.com/trending', 'proxy').src)
      .toContain(encodeURIComponent('https://github.com/trending'));
    expect(classify('https://discord.com/app', 'direct').mode).toBe('direct'); // user's call
    expect(classify('https://some-random.blog/post').mode).toBe('direct');
  });
});

describe('small helpers', () => {
  it('proxyWrap encodes the target', () => {
    expect(proxyWrap('https://a.b/?x=1')).toBe('/proxy?url=' + encodeURIComponent('https://a.b/?x=1'));
  });

  it('displayUrl hides the scheme and trailing slash', () => {
    expect(displayUrl('https://example.com/')).toBe('example.com');
    expect(displayUrl('http://a.b/c/d')).toBe('a.b/c/d');
    expect(displayUrl(null)).toBe('');
  });

  it('hostOf/titleFor feed tab labels; relative URLs resolve against the app', () => {
    expect(hostOf('https://www.example.com/x')).toBe('www.example.com');
    expect(titleFor('https://www.example.com/x')).toBe('example.com');
    expect(titleFor('')).toBe('New tab');
    expect(hostOf('/proxy?url=x')).toBe(location.hostname); // same-origin proxy URL
  });
});
