// The /proxy Pages Function (public/_worker.js): framing-guard stripping,
// <base> injection, navigation rewriting, form folding, and the request
// validation that keeps the endpoint same-origin and http(s)-only.
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../public/_worker.js';

const SITE = 'https://artcraft-webos.pages.dev';

let upstream;
const call = (path, headers = {}) =>
  worker.fetch(new Request(`${SITE}${path}`, { headers }));

const proxied = (url, headers = {}) =>
  call(`/proxy?url=${encodeURIComponent(url)}`, headers);

/* undici Responses built from a string have a blank .url (Workers' fetch()
   always populates it) — give the mock a real final URL. */
const mockResp = (body, url, type = 'text/html') => {
  const r = new Response(body, { headers: { 'content-type': type } });
  Object.defineProperty(r, 'url', { value: url });
  return r;
};

beforeEach(() => {
  upstream = vi.fn(async () => mockResp('<html></html>', 'https://a.b/'));
  vi.stubGlobal('fetch', upstream);
});
afterEach(() => vi.unstubAllGlobals());

describe('request validation', () => {
  it('refuses cross-origin callers and non-http targets; 404s other paths', async () => {
    expect((await proxied('https://a.b/', { origin: 'https://evil.example' })).status).toBe(403);
    expect((await proxied('file:///etc/passwd')).status).toBe(400);
    expect((await proxied('not a url')).status).toBe(400);
    expect((await call('/elsewhere')).status).toBe(404);
  });
});

describe('response hygiene', () => {
  it('strips framing guards and embedder state from the upstream response', async () => {
    upstream.mockImplementationOnce(async () => {
      const r = new Response('<p>hi</p>', {
        headers: {
          'content-type': 'text/html',
          'x-frame-options': 'DENY',
          'content-security-policy': "frame-ancestors 'none'",
          'cross-origin-opener-policy': 'same-origin',
          'set-cookie': 'session=xyz',
        },
      });
      Object.defineProperty(r, 'url', { value: 'http://old.example/x' });
      return r;
    });
    const resp = await proxied('http://old.example/x', { origin: SITE });
    expect(resp.status).toBe(200);
    for (const h of ['x-frame-options', 'content-security-policy', 'cross-origin-opener-policy', 'set-cookie']) {
      expect(resp.headers.get(h)).toBeNull();
    }
    expect(resp.headers.get('referrer-policy')).toBe('no-referrer');
    expect(resp.headers.get('content-type')).toBe('text/html');
    expect(String(upstream.mock.calls[0][0])).toBe('http://old.example/x');
  });

  it('non-HTML bodies stream through untouched — no <base>, no rewriting', async () => {
    upstream.mockImplementationOnce(async () => mockResp('body{color:red}', 'https://a.b/style.css', 'text/css'));
    const resp = await proxied('https://a.b/style.css');
    expect(await resp.text()).toBe('body{color:red}');
  });
});

describe('html rewriting', () => {
  const html = [
    '<head><title>t</title></head>',
    '<a href="https://target.example/p?x=1">abs</a>',
    "<a href='/rel/path'>rel</a>",
    '<a href="//hostless.example/z">proto</a>',
    '<a href="#frag">frag</a>',
    '<a href="javascript:void(0)">js</a>',
    '<a>no href</a>',
    '<form action="/search" method="GET"><input name=q></form>',
    '<form action="https://target.example/POST" method="POST"></form>',
  ].join('');

  beforeEach(() => {
    upstream.mockImplementation(async () => mockResp(`<html>${html}`, 'https://target.example/dir/page'));
  });

  it('keeps link and form navigation inside the proxy, resolving relative targets', async () => {
    const out = await (await proxied('https://target.example/dir/page')).text();
    expect(out).toContain('href="/proxy?url=' + encodeURIComponent('https://target.example/p?x=1') + '"');
    // the author's quote character is preserved
    expect(out).toContain(`href='/proxy?url=${encodeURIComponent('https://target.example/rel/path')}'`);
    expect(out).toContain('href="/proxy?url=' + encodeURIComponent('https://hostless.example/z') + '"');
    expect(out).toContain('action="/proxy/form?url=' + encodeURIComponent('https://target.example/search') + '"');
    // same-document and non-http targets stay as authored
    expect(out).toContain('href="#frag"');
    expect(out).toContain('href="javascript:void(0)"');
  });

  it('injects <base href> as the first thing inside <head>', async () => {
    const out = await (await proxied('https://target.example/dir/page')).text();
    expect(out).toContain('<head><base href="https://target.example/dir/page">');
  });
});

describe('/proxy/form', () => {
  it('folds sibling query params into the target URL, preserving existing ones', async () => {
    await call('/proxy/form?url=' + encodeURIComponent('https://www.bing.com/search')
      + '&q=cats&safe=off');
    expect(String(upstream.mock.calls[0][0])).toBe('https://www.bing.com/search?q=cats&safe=off');

    await call('/proxy/form?url=' + encodeURIComponent('https://a.b/?x=1') + '&q=cats');
    expect(String(upstream.mock.calls[1][0])).toBe('https://a.b/?x=1&q=cats');
  });

  it('forwards form POSTs with their body and content type', async () => {
    await worker.fetch(new Request(`${SITE}/proxy/form?url=${encodeURIComponent('https://a.b/submit')}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: SITE },
      body: 'user=me&hide=1',
    }));
    expect(String(upstream.mock.calls[0][0])).toBe('https://a.b/submit');
    expect(upstream.mock.calls[0][1].method).toBe('POST');
    expect(upstream.mock.calls[0][1].body).toBe('user=me&hide=1');
  });

  it('validates the folded target', async () => {
    expect((await call('/proxy/form?q=cats')).status).toBe(400);
    expect((await call('/proxy/form?url=' + encodeURIComponent('ftp://a.b/') + '&q=1')).status).toBe(400);
  });
});
