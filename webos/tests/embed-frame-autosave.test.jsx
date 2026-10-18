// firecraftAutosave / firecraftRestore unit tests.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { firecraftAutosave, firecraftRestore } from '../src/shell/EmbedFrame.jsx';

// Mock the bridge and db dependencies.
const postToAppMock = vi.fn();
const filePutMock = vi.fn().mockResolvedValue(undefined);
const fileGetMock = vi.fn().mockResolvedValue(null);

vi.mock('../src/os/bridge.js', () => ({
  postToApp: (...args) => postToAppMock(...args),
}));

vi.mock('../src/os/db.js', () => ({
  filePut: (...args) => filePutMock(...args),
  fileGet: (...args) => fileGetMock(...args),
}));

const FAKE_FRAME = {};

describe('firecraftAutosave', () => {
  beforeEach(() => {
    postToAppMock.mockReset().mockResolvedValue({ ok: true });
    filePutMock.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips when localStorage toggle is false', () => {
    localStorage.setItem('webos.firecraft.autosave', 'false');
    firecraftAutosave(FAKE_FRAME);
    // No postToApp call, no filePut call
    expect(postToAppMock).not.toHaveBeenCalled();
  });

  it('posts exportDocument to the frame', () => {
    postToAppMock.mockResolvedValue({ ok: true, bytes: new Uint8Array([0x89, 0x50]) });
    firecraftAutosave(FAKE_FRAME);

    // Advance past the 1200ms debounce
    vi.advanceTimersByTime(1300);

    expect(postToAppMock).toHaveBeenCalledWith(FAKE_FRAME, { type: 'exportDocument' }, 'firecraft');
  });

  it('stores bytes as a PNG blob when exportDocument returns them', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    postToAppMock.mockResolvedValue({ ok: true, bytes });
    firecraftAutosave(FAKE_FRAME);
    vi.advanceTimersByTime(1300);

    // await all pending promises
    await vi.runAllTimersAsync();

    expect(filePutMock).toHaveBeenCalledWith(
      '/Apps/firecraft/autosave.fw.png',
      expect.objectContaining({ type: 'image/png' }),
      'image/png'
    );
    const calledBlob = filePutMock.mock.calls[0][1];
    expect(await calledBlob.arrayBuffer()).toBeInstanceOf(ArrayBuffer);
  });

  it('does not filePut when exportDocument returns no bytes', async () => {
    postToAppMock.mockResolvedValue({ ok: true }); // no bytes
    firecraftAutosave(FAKE_FRAME);
    vi.advanceTimersByTime(1300);
    await vi.runAllTimersAsync();

    expect(filePutMock).not.toHaveBeenCalled();
  });

  it('silently catches postToApp errors', async () => {
    postToAppMock.mockRejectedValue(new Error('timeout'));
    // Should not throw
    firecraftAutosave(FAKE_FRAME);
    vi.advanceTimersByTime(1300);
    await vi.runAllTimersAsync();
    expect(filePutMock).not.toHaveBeenCalled();
  });
});

describe('firecraftRestore', () => {
  beforeEach(() => {
    postToAppMock.mockReset().mockResolvedValue({ ok: true });
    fileGetMock.mockReset().mockResolvedValue(null);
    localStorage.clear();
  });

  it('skips when localStorage toggle is false', async () => {
    localStorage.setItem('webos.firecraft.autosave', 'false');
    await firecraftRestore(FAKE_FRAME);
    expect(fileGetMock).not.toHaveBeenCalled();
  });

  it('opens saved document on ready when autosave exists', async () => {
    const savedBytes = new Uint8Array([0x89, 0x50, 0x4e]);
    const savedBlob = new Blob([savedBytes], { type: 'image/png' });
    fileGetMock.mockResolvedValue({ blob: savedBlob });

    await firecraftRestore(FAKE_FRAME);

    expect(fileGetMock).toHaveBeenCalledWith('/Apps/firecraft/autosave.fw.png');
    expect(postToAppMock).toHaveBeenCalledWith(
      FAKE_FRAME,
      expect.objectContaining({ type: 'openDocument' }),
      'firecraft'
    );
    const [, req] = postToAppMock.mock.calls[0];
    expect(req.bytes).toBeInstanceOf(ArrayBuffer);
  });

  it('does nothing when no saved doc exists', async () => {
    fileGetMock.mockResolvedValue(null);
    await firecraftRestore(FAKE_FRAME);
    expect(postToAppMock).not.toHaveBeenCalled();
  });

  it('silently catches fileGet errors', async () => {
    fileGetMock.mockRejectedValue(new Error('indexedDB error'));
    // Should not throw
    await firecraftRestore(FAKE_FRAME);
    expect(postToAppMock).not.toHaveBeenCalled();
  });
});
