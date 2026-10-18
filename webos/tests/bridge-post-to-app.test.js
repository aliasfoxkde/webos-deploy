// postToApp: shell→app request/reply correlate.
import { describe, it, expect, vi } from 'vitest';
import { postToApp } from '../src/os/bridge.js';

function makeFrame() {
  const handlers = {};
  const contentWindow = {
    addEventListener: (evt, h) => { handlers[evt] = h; },
    removeEventListener: (evt, _h) => { delete handlers[evt]; },
    postMessage: vi.fn(),
  };
  const frame = { contentWindow };
  const fire = (data, source = 'firecraft') =>
    handlers['message']?.({ data: { ...data, source } });
  return { frame, contentWindow, fire };
}

describe('postToApp', () => {
  it('posts with requestId and resolves on matching ok reply', async () => {
    const { frame, contentWindow, fire } = makeFrame();
    let sentId;
    contentWindow.postMessage.mockImplementation((msg) => { sentId = msg.requestId; });
    const p = postToApp(frame, { type: 'ping' }, 'firecraft', 5000);
    fire({ requestId: sentId, ok: true, type: 'ready' });
    await expect(p).resolves.toMatchObject({ ok: true, type: 'ready' });
  });

  it('rejects on ok:false reply with error text', async () => {
    const { frame, contentWindow, fire } = makeFrame();
    let sentId;
    contentWindow.postMessage.mockImplementation((msg) => { sentId = msg.requestId; });
    const p = postToApp(frame, { type: 'openDocument', bytes: [] }, 'firecraft', 5000);
    fire({ requestId: sentId, ok: false, error: 'document not found' });
    await expect(p).rejects.toThrow('document not found');
  });

  it('rejects on timeout', async () => {
    const { frame } = makeFrame();
    const p = postToApp(frame, { type: 'exportDocument' }, 'firecraft', 50);
    await expect(p).rejects.toThrow('timeout');
  });

  it('ignores replies from other sources', async () => {
    const { frame, contentWindow, fire } = makeFrame();
    let sentId;
    contentWindow.postMessage.mockImplementation((msg) => { sentId = msg.requestId; });
    const p = postToApp(frame, { type: 'ping' }, 'firecraft', 5000);
    fire({ requestId: sentId, ok: true }, 'other-source');
    fire({ requestId: sentId, ok: true }, 'firecraft');
    await expect(p).resolves.toMatchObject({ ok: true });
  });

  it('ignores replies with wrong requestId', async () => {
    const { frame, contentWindow, fire } = makeFrame();
    let sentId;
    contentWindow.postMessage.mockImplementation((msg) => { sentId = msg.requestId; });
    const p = postToApp(frame, { type: 'ping' }, 'firecraft', 5000);
    fire({ requestId: 'wrong-id', ok: true }, 'firecraft');
    fire({ requestId: sentId, ok: true }, 'firecraft');
    await expect(p).resolves.toMatchObject({ ok: true });
  });
});
