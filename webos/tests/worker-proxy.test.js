// Legacy proxy routes must fail closed. Remote HTML is no longer fetched
// or returned under the WebOS origin; this protects shell storage and APIs.
 // @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../public/_worker.js';

const SITE = 'https://artcraft-webos.pages.dev';

let upstream;
const call = (path, init = {}) =>
  worker.fetch(new Request(`${SITE}${path}`, init));

beforeEach(() => {
  upstream = vi.fn(async () => new Response('<html>untrusted</html>'));
  vi.stubGlobal('fetch', upstream);
});
afterEach(() => vi.unstubAllGlobals());

describe('legacy same-origin proxy shutdown', () => {
  it.each([
    '/proxy?url=https%3A%2F%2Fattacker.example%2Fpage',
    '/proxy/form?url=https%3A%2F%2Fattacker.example%2Fsubmit&q=hello',
    '/proxy/form?q=missing-target',
    '/proxy?url=file%3A%2F%2F%2Fetc%2Fpasswd',
    '/proxy',
    '/proxy/anything',
    '/unrelated/path',
  ])('returns a fixed 410 response for %s', async (path) => {
    const response = await call(path);
    expect(response.status).toBe(410);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const body = await response.json();
    expect(body.error).toMatch(/disabled for security/i);
    expect(JSON.stringify(body)).not.toContain('attacker.example');
  });

  it('never invokes fetch or returns upstream HTML', async () => {
    const response = await call('/proxy?url=https%3A%2F%2Fattacker.example%2Fpage', {
      headers: { origin: SITE },
    });
    const body = await response.text();
    expect(response.status).toBe(410);
    expect(upstream).not.toHaveBeenCalled();
    expect(body).not.toContain('<html>');
    expect(body).not.toContain('untrusted');
  });

  it('fails closed for non-GET form submissions as well', async () => {
    const response = await call('/proxy/form?url=https%3A%2F%2Fattacker.example%2Fsubmit', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: SITE },
      body: 'secret=value',
    });
    expect(response.status).toBe(410);
    expect(upstream).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain('secret=value');
  });
});
