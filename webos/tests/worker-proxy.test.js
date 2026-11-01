// The /proxy Pages Function (public/_worker.js) fails closed. The legacy
// same-origin HTML proxy executed untrusted remote scripts with the WebOS
// origin (issue #12), so the endpoint now serves a fixed 410 for every
// request and never fetches remote content — no matter the path, method,
// or caller.
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import worker from '../public/_worker.js';

const SITE = 'https://artcraft-webos.pages.dev';
const call = (path, init = {}) => worker.fetch(new Request(`${SITE}${path}`, init));

describe('fail-closed endpoint', () => {
  it('answers 410 on every proxied path, with a JSON error and no fetch', async () => {
    for (const path of [
      '/proxy?url=https%3A%2F%2Fa.b%2F',
      '/proxy/form?url=https%3A%2F%2Fa.b%2F&q=cats',
      '/proxy',
      '/elsewhere',
    ]) {
      const resp = await call(path);
      expect(resp.status).toBe(410);
      const body = await resp.json();
      expect(body.error).toMatch(/disabled for security/);
    }
  });

  it('never touches the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      await call('/proxy?url=https%3A%2F%2Finternal.example%2Fsecret');
      await call('/proxy/form?url=https%3A%2F%2Fa.b%2F', { method: 'POST', body: 'x=1' });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('response hygiene: no-store, nosniff, json', async () => {
    const resp = await call('/proxy?url=https%3A%2F%2Fa.b%2F');
    expect(resp.headers.get('cache-control')).toBe('no-store');
    expect(resp.headers.get('x-content-type-options')).toBe('nosniff');
    expect(resp.headers.get('content-type')).toContain('application/json');
  });

  it('does not reflect the target URL or honor caller-supplied headers', async () => {
    const resp = await call('/proxy?url=https%3A%2F%2Fevil.example%2Fx',
      { headers: { origin: 'https://evil.example' } });
    const text = await resp.text();
    expect(text).not.toContain('evil.example');
    expect(resp.headers.get('access-control-allow-origin')).toBeNull();
  });
});
