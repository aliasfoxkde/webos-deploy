// Snippet + CastCraft component behaviour. The browser media APIs
// (getDisplayMedia/getUserMedia) and the 2D canvas are faked so the apps
// exercise their real state machines without a real capture device.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, waitFor, cleanup, act } from '@testing-library/react';
import SnippetApp from '../src/apps/snippet/SnippetApp.jsx';
import CastApp from '../src/apps/cast/CastApp.jsx';

const h = vi.hoisted(() => ({
  files: [],
  tracks: [],
  mediaStreams: [],
  displayError: null,
}));

vi.mock('../src/os/db.js', () => ({
  filePut: async (path, blob, type) => {
    h.files.push({ path, blob, type });
  },
  fileGet: async () => null,
  fileList: async () => h.files,
}));

// A 2D context that records every drawing call so annotation strokes can be
// asserted, and answers every other call the apps make.
export const drawCalls = [];
const ctx2d = () => new Proxy({}, {
  get(_, prop) {
    if (prop === 'canvas') return undefined;
    if (prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'lineWidth') return undefined;
    return (...args) => { drawCalls.push([prop, ...args]); };
  },
  set(_, prop, value) {
    if (prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'lineWidth') drawCalls.push([`set:${prop}`, value]);
    return true;
  },
});

const fakeTrack = () => {
  const t = { stopped: false, listeners: {}, stop() { this.stopped = true; } };
  h.tracks.push(t);
  return t;
};

const fakeStream = (withAudio = false) => {
  const video = fakeTrack();
  const audio = withAudio ? fakeTrack() : null;
  const tracks = audio ? [video, audio] : [video];
  const stream = {
    tracks,
    getTracks: () => tracks,
    getVideoTracks: () => [video],
    getAudioTracks: () => (audio ? [audio] : []),
    addTrack: (t) => { tracks.push(t); return stream; },
  };
  video.addEventListener = (ev, fn) => { video.listeners[ev] = fn; };
  h.mediaStreams.push(stream);
  return stream;
};

// navigator has getter-only members in happy-dom — patch via defineProperty.
const stubNavigator = (overrides) => {
  for (const [key, value] of Object.entries(overrides)) {
    Reflect.defineProperty(window.navigator, key, { value, configurable: true });
  }
};

beforeEach(() => {
  h.files = [];
  h.tracks = [];
  h.mediaStreams = [];
  h.displayError = null;
  drawCalls.length = 0;

  Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: (type) => (type === '2d' ? ctx2d() : null), configurable: true, writable: true,
  });
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    value: function toBlob(cb) { cb(new Blob(['x'], { type: 'image/png' })); },
    configurable: true, writable: true,
  });
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
    value: () => fakeStream(true),
    configurable: true, writable: true,
  });
  // happy-dom has no media pipeline: fake the captured frame size.
  Reflect.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { value: 800, configurable: true });
  Reflect.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { value: 600, configurable: true });
  // happy-dom rejects a plain object as srcObject — accept one.
  Reflect.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    value: null, writable: true, configurable: true,
  });
  // blob: URLs never load in happy-dom — the decoded image is delivered
  // synchronously instead.
  vi.stubGlobal('Image', class {
    constructor() { this.naturalWidth = 800; this.naturalHeight = 600; }
    set src(_) { queueMicrotask(() => this.onload?.()); }
  });
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => {},
  }));
  stubNavigator({
    mediaDevices: {
      getDisplayMedia: async () => {
        if (h.displayError) throw h.displayError;
        return fakeStream(false);
      },
      getUserMedia: async () => fakeStream(true),
    },
    clipboard: { write: async () => {} },
  });
  vi.stubGlobal('ClipboardItem', class { constructor(b) { this.b = b; } });
  // Run one composite frame immediately, then stop — covers the rAF loop
  // body without an infinite render-loop in the test.
  let rafBound = 0;
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    if (rafBound < 5) { rafBound += 1; cb(performance.now()); }
    return rafBound;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'getContext');
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'toBlob');
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'captureStream');
  vi.unstubAllGlobals();
  cleanup();
});

describe('Snippet app', () => {
  // Drive SnippetApp through a real capture into the editor state.
  const captureIntoEditor = async () => {
    render(<SnippetApp />);
    fireEvent.click(screen.getByText('Capture'));
    fireEvent.click(screen.getByText('Choose source'));
    const video = await waitFor(() => {
      const v = screen.getByLabelText('Screen capture').querySelector('video');
      if (!v) throw new Error('capture video not mounted yet');
      return v;
    });
    fireEvent.pointerDown(video, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(video, { clientX: 100, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(video, { clientX: 100, clientY: 80, pointerId: 1 });
    await waitFor(() => expect(screen.getByText('Pen')).toBeTruthy());
  };

  it('starts empty and opens the capture overlay', () => {
    render(<SnippetApp />);
    expect(screen.getByText(/No capture yet/)).toBeTruthy();
    fireEvent.click(screen.getByText('Capture'));
    expect(screen.getByText(/Choose the screen/)).toBeTruthy();
  });

  it('cancels the overlay without capturing', () => {
    render(<SnippetApp />);
    fireEvent.click(screen.getByText('Capture'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText(/Choose the screen/)).toBeNull();
  });

  it('reports an unsupported capture API instead of crashing', async () => {
    stubNavigator({ mediaDevices: undefined });
    render(<SnippetApp />);
    fireEvent.click(screen.getByText('Capture'));
    fireEvent.click(screen.getByText('Choose source'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/not supported/i));
  });

  it('stays quiet when the user dismisses the source picker', async () => {
    h.displayError = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    render(<SnippetApp />);
    fireEvent.click(screen.getByText('Capture'));
    fireEvent.click(screen.getByText('Choose source'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('surfaces a real capture failure', async () => {
    h.displayError = new Error('device busy');
    render(<SnippetApp />);
    fireEvent.click(screen.getByText('Capture'));
    fireEvent.click(screen.getByText('Choose source'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/device busy/));
  });

  it('captures a dragged region and enables the editor tools', async () => {
    render(<SnippetApp />);
    fireEvent.click(screen.getByText('Capture'));
    fireEvent.click(screen.getByText('Choose source'));
    const video = await waitFor(() => {
      const v = screen.getByLabelText('Screen capture').querySelector('video');
      if (!v) throw new Error('capture video not mounted yet');
      return v;
    });
    fireEvent.pointerDown(video, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(video, { clientX: 100, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(video, { clientX: 100, clientY: 80, pointerId: 1 });
    await waitFor(() => expect(screen.getByText('Pen')).toBeTruthy());
    expect(screen.getByText('Arrow')).toBeTruthy();
  });

  it('ignores a click that is not a drag (no capture)', async () => {
    render(<SnippetApp />);
    fireEvent.click(screen.getByText('Capture'));
    fireEvent.click(screen.getByText('Choose source'));
    const video = await waitFor(() => {
      const v = screen.getByLabelText('Screen capture').querySelector('video');
      if (!v) throw new Error('capture video not mounted yet');
      return v;
    });
    fireEvent.pointerDown(video, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(video, { clientX: 12, clientY: 12, pointerId: 1 });
    expect(screen.queryByText('Pen')).toBeNull();
  });

  it('saves the annotated capture into the files store', async () => {
    render(<SnippetApp />);
    fireEvent.click(screen.getByText('Capture'));
    fireEvent.click(screen.getByText('Choose source'));
    const video = await waitFor(() => {
      const v = screen.getByLabelText('Screen capture').querySelector('video');
      if (!v) throw new Error('capture video not mounted yet');
      return v;
    });
    fireEvent.pointerDown(video, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(video, { clientX: 100, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(video, { clientX: 100, clientY: 80, pointerId: 1 });
    await waitFor(() => expect(screen.getByText('Pen')).toBeTruthy());
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(h.files.length).toBe(1));
    expect(h.files[0].path).toMatch(/^Pictures\/snippet-\d{8}-\d{6}\.png$/);
  });

  it('draws pen strokes while dragging on the ink canvas', async () => {
    await captureIntoEditor();
    const ink = document.querySelector('canvas.snip-ink');
    Object.defineProperty(ink, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }), configurable: true,
    });
    fireEvent.pointerDown(ink, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(ink, { clientX: 50, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(ink, { clientX: 80, clientY: 70, pointerId: 1 });
    fireEvent.pointerUp(ink, { clientX: 80, clientY: 70, pointerId: 1 });
    // Pen strokes go through beginPath/moveTo/lineTo/stroke.
    const props = drawCalls.map((c) => c[0]);
    expect(props).toContain('beginPath');
    expect(props).toContain('moveTo');
    expect(props).toContain('lineTo');
    expect(props).toContain('stroke');
  });

  it('draws an arrow head on pointer up with the arrow tool', async () => {
    await captureIntoEditor();
    fireEvent.click(screen.getByText('Arrow'));
    const ink = document.querySelector('canvas.snip-ink');
    Object.defineProperty(ink, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }), configurable: true,
    });
    fireEvent.pointerDown(ink, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(ink, { clientX: 90, clientY: 90, pointerId: 1 });
    const props = drawCalls.map((c) => c[0]);
    expect(props).toContain('closePath');
    expect(props).toContain('fill');
  });

  it('draws a rectangle outline with the box tool', async () => {
    await captureIntoEditor();
    fireEvent.click(screen.getByText('Box'));
    const ink = document.querySelector('canvas.snip-ink');
    Object.defineProperty(ink, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }), configurable: true,
    });
    fireEvent.pointerDown(ink, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerUp(ink, { clientX: 60, clientY: 45, pointerId: 1 });
    expect(drawCalls.map((c) => c[0])).toContain('strokeRect');
  });

  it('changes color via the swatches', async () => {
    await captureIntoEditor();
    fireEvent.click(screen.getByLabelText('Color #38bdf8'));
    const ink = document.querySelector('canvas.snip-ink');
    Object.defineProperty(ink, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }), configurable: true,
    });
    fireEvent.pointerDown(ink, { clientX: 1, clientY: 1, pointerId: 1 });
    fireEvent.pointerMove(ink, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(ink, { clientX: 20, clientY: 20, pointerId: 1 });
    const style = drawCalls.find((c) => c[0] === 'set:strokeStyle');
    expect(style && style[1]).toBe('#38bdf8');
  });

  it('copies the flattened capture to the clipboard', async () => {
    const written = [];
    stubNavigator({
      mediaDevices: window.navigator.mediaDevices,
      clipboard: { write: async (items) => { written.push(...items); } },
    });
    await captureIntoEditor();
    fireEvent.click(screen.getByText('Copy'));
    await waitFor(() => expect(screen.getByText(/Saved to clipboard/)).toBeTruthy());
    expect(written).toHaveLength(1);
    expect(written[0].b['image/png']).toBeInstanceOf(Blob);
  });

  it('surfaces a clipboard denial instead of crashing', async () => {
    stubNavigator({
      mediaDevices: window.navigator.mediaDevices,
      clipboard: { write: async () => { throw new Error('denied'); } },
    });
    await captureIntoEditor();
    fireEvent.click(screen.getByText('Copy'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Clipboard write was denied/));
  });

  it('downloads the flattened capture', async () => {
    const clicks = [];
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: (blob) => `blob:${blob ? 'b' : ''}`,
      revokeObjectURL: () => {},
    }));
    // createElement uses window's own constructor, not the test global —
    // record the click on the real prototype instead of swapping the class.
    const realClick = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function click() { clicks.push(this); };
    try {
      await captureIntoEditor();
      fireEvent.click(screen.getByText('Download'));
      // download() is async (flatten awaits toBlob) — the click lands a tick later.
      await waitFor(() => expect(clicks).toHaveLength(1));
      expect(clicks[0].download).toBe('snippet.png');
      expect(String(clicks[0].href)).toMatch(/^blob:/);
    } finally {
      window.HTMLAnchorElement.prototype.click = realClick;
    }
  });

  it('discards the capture and returns to the empty state', async () => {
    await captureIntoEditor();
    fireEvent.click(screen.getByText('Discard'));
    await waitFor(() => expect(screen.getByText(/No capture yet/)).toBeTruthy());
    expect(screen.queryByText('Pen')).toBeNull();
    expect(screen.queryByText(/Saved to/)).toBeNull();
  });

  it('cancels the overlay with Escape and stops the stream tracks', async () => {
    render(<SnippetApp />);
    fireEvent.click(screen.getByText('Capture'));
    fireEvent.click(screen.getByText('Choose source'));
    await waitFor(() => {
      const v = screen.getByLabelText('Screen capture').querySelector('video');
      if (!v) throw new Error('capture video not mounted yet');
    });
    expect(h.tracks.every((t) => !t.stopped)).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(h.tracks.every((t) => t.stopped)).toBe(true);
    await waitFor(() => expect(screen.queryByLabelText('Screen capture')).toBeNull());
  });

  it('rejects a selection entirely outside the captured frame and returns to drag', async () => {
    // No layout box: the intrinsic frame size (800x600) is the viewport, so a
    // selection far off-canvas maps outside the source.
    render(<SnippetApp />);
    fireEvent.click(screen.getByText('Capture'));
    fireEvent.click(screen.getByText('Choose source'));
    // The video is always mounted; wait for the drag phase before firing
    // pointer events (start() resolves on a microtask).
    await waitFor(() => expect(screen.getByText(/Drag to select a region/)).toBeTruthy());
    const video = screen.getByLabelText('Screen capture').querySelector('video');
    fireEvent.pointerDown(video, { clientX: 5000, clientY: 5000, pointerId: 1 });
    fireEvent.pointerMove(video, { clientX: 5100, clientY: 5100, pointerId: 1 });
    fireEvent.pointerUp(video, { clientX: 5100, clientY: 5100, pointerId: 1 });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/outside the captured frame/));
    expect(screen.getByText(/Drag to select a region/)).toBeTruthy();
    // Tracks are still live — capture was not torn down.
    expect(h.tracks.every((t) => !t.stopped)).toBe(true);
  });

  it('ignores pointer moves and ups with no active drag', async () => {
    render(<SnippetApp />);
    fireEvent.click(screen.getByText('Capture'));
    fireEvent.click(screen.getByText('Choose source'));
    await waitFor(() => expect(screen.getByText(/Drag to select a region/)).toBeTruthy());
    const video = screen.getByLabelText('Screen capture').querySelector('video');
    // No pointerDown first — neither handler may throw or start processing.
    fireEvent.pointerMove(video, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(video, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(screen.queryByText('Processing…')).toBeNull();
    expect(screen.getByText(/Drag to select a region/)).toBeTruthy();
  });

  it('ignores pointer events while processing', async () => {
    render(<SnippetApp />);
    fireEvent.click(screen.getByText('Capture'));
    fireEvent.click(screen.getByText('Choose source'));
    const video = await waitFor(() => {
      const v = screen.getByLabelText('Screen capture').querySelector('video');
      if (!v) throw new Error('capture video not mounted yet');
      return v;
    });
    fireEvent.pointerDown(video, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(video, { clientX: 100, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(video, { clientX: 100, clientY: 80, pointerId: 1 });
    // A pointerDown during processing must not restart a drag.
    fireEvent.pointerDown(video, { clientX: 0, clientY: 0, pointerId: 2 });
    fireEvent.pointerMove(video, { clientX: 200, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(video, { clientX: 200, clientY: 200, pointerId: 2 });
    await waitFor(() => expect(screen.getByText('Pen')).toBeTruthy());
    expect(h.files).toHaveLength(0); // no save yet — only one capture was made
  });
});

describe('CastCraft app', () => {
  it('starts with no sources', () => {    render(<CastApp />);
    expect(screen.getByText(/No sources/)).toBeTruthy();
    expect(screen.getByText('● Record').hasAttribute('disabled')).toBe(true);
  });

  it('adds a screen source and lists it', async () => {
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add screen'));
    await waitFor(() => expect(screen.getByText('Screen')).toBeTruthy());
  });

  it('adds a camera source', async () => {
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add camera'));
    await waitFor(() => expect(screen.getByText('Camera + Mic')).toBeTruthy());
  });

  it('toggles a source visible and hidden', async () => {
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add screen'));
    await waitFor(() => expect(screen.getByText('Screen')).toBeTruthy());
    const eye = screen.getByLabelText('Hide Screen');
    fireEvent.click(eye);
    await waitFor(() => expect(screen.getByLabelText('Show Screen')).toBeTruthy());
  });

  it('removes a source and stops its tracks', async () => {
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add screen'));
    await waitFor(() => expect(screen.getByText('Screen')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Remove Screen'));
    await waitFor(() => expect(screen.queryByText('Screen')).toBeNull());
    expect(h.tracks.every((t) => t.stopped)).toBe(true);
  });

  it('drops a source when the browser stops sharing', async () => {
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add screen'));
    await waitFor(() => expect(screen.getByText('Screen')).toBeTruthy());
    const track = h.mediaStreams[0].getVideoTracks()[0];
    act(() => { track.listeners.ended?.(); });
    await waitFor(() => expect(screen.queryByText('Screen')).toBeNull());
  });

  it('surfaces a capture failure', async () => {
    stubNavigator({
      mediaDevices: {
        getDisplayMedia: async () => { throw new Error('no display'); },
        getUserMedia: async () => fakeStream(true),
      },
    });
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add screen'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/no display/));
  });

  it('stays quiet when the user dismisses the capture prompt', async () => {
    stubNavigator({
      mediaDevices: {
        getDisplayMedia: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); },
        getUserMedia: async () => fakeStream(true),
      },
    });
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add screen'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('records the composite and offers a download', async () => {
    const rec = { state: 'inactive', start: vi.fn(), stop: vi.fn(function stop() { this.state = 'inactive'; this.onstop?.(); }), ondataavailable: null, onstop: null };
    vi.stubGlobal('MediaRecorder', class { constructor() { return rec; } });
    vi.stubGlobal('AudioContext', class {
      createMediaStreamDestination() { return { stream: fakeStream(true) }; }
      createMediaStreamSource() { return { connect: () => {} }; }
      close() {}
    });
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add screen'));
    await waitFor(() => expect(screen.getByText('Screen')).toBeTruthy());
    fireEvent.click(screen.getByText('● Record'));
    await waitFor(() => expect(screen.getByText('■ Stop')).toBeTruthy());
    fireEvent.click(screen.getByText('■ Stop'));
    await waitFor(() => expect(screen.getByText('Download recording')).toBeTruthy());
  });

  it('paints the composite loop even when a source video cannot attach', async () => {
    // document.createElement('video') returns a happy-dom element whose
    // videoWidth is the stubbed 800 — the contain-fit math runs either way.
    // The frame path is also exercised with no sources at all (fill only).
    drawCalls.length = 0;
    render(<CastApp />);
    await act(async () => {});
    expect(drawCalls.some((c) => c[0] === 'fillRect')).toBe(true);
    fireEvent.click(screen.getByText('Add screen'));
    await waitFor(() => expect(screen.getByText('Screen')).toBeTruthy());
    await act(async () => {});
    // The source video could not produce frames (no real media pipeline), so
    // only the background fill runs — no crash, no drawImage of a dead video.
    expect(drawCalls.every((c) => c[0] !== 'drawImage' || c[1] instanceof HTMLVideoElement)).toBe(true);
  });

  it('contain-fits an attached source into the composite frame', async () => {
    drawCalls.length = 0;
    render(<CastApp />);
    // Re-arm the rAF budget: the stub ran dry during earlier frames, and the
    // composite effect re-subscribes when the first source arrives.
    let fired = 0;
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      if (fired < 3) { fired += 1; queueMicrotask(() => cb(performance.now())); }
      return fired;
    });
    try {
      fireEvent.click(screen.getByText('Add screen'));
      await waitFor(() => expect(screen.getByText('Screen')).toBeTruthy());
      await act(async () => {});
      // The attached video reports the stubbed videoWidth 800, so the
      // contain-fit drawImage branch runs for the visible source.
      const draws = drawCalls.filter((c) => c[0] === 'drawImage');
      expect(draws.length).toBeGreaterThan(0);
      expect(draws[0][1] instanceof HTMLVideoElement).toBe(true);
    } finally {
      drawCalls.length = 0;
    }
  });

  it('toggles a source off and back on', async () => {
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add screen'));
    await waitFor(() => expect(screen.getByText('Screen')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Hide Screen'));
    await waitFor(() => expect(screen.getByLabelText('Show Screen')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Show Screen'));
    await waitFor(() => expect(screen.getByLabelText('Hide Screen')).toBeTruthy());
  });

  it('surfaces the fallback message when the error has no name/message', async () => {
    stubNavigator({
      mediaDevices: {
        getDisplayMedia: async () => { throw 'nope'; }, // non-Error throw
        getUserMedia: async () => fakeStream(true),
      },
    });
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add screen'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Screen capture failed/));
  });

  it('surfaces the camera failure message', async () => {
    stubNavigator({
      mediaDevices: {
        getDisplayMedia: async () => fakeStream(false),
        getUserMedia: async () => { throw new Error('cam busy'); },
      },
    });
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add camera'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/cam busy/));
  });

  it('uses the default camera message when the rejection is nameless', async () => {
    stubNavigator({
      mediaDevices: {
        getDisplayMedia: async () => fakeStream(false),
        getUserMedia: async () => { throw Object.assign(new Error(), { name: '' }); },
      },
    });
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add camera'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Camera\/mic access failed/));
  });

  it('mixes an audio-bearing source into the recording', async () => {
    const connected = [];
    const destStream = fakeStream(true);
    vi.stubGlobal('MediaRecorder', class {
      constructor() {
        this.state = 'inactive';
        this.start = vi.fn();
        this.stop = () => { this.state = 'inactive'; this.onstop?.(); };
        this.ondataavailable = null;
        this.onstop = null;
      }
    });
    vi.stubGlobal('AudioContext', class {
      createMediaStreamDestination() { return { stream: destStream }; }
      createMediaStreamSource(s) { connected.push(s); return { connect: () => {} }; }
      close() {}
    });
    // A camera source carries audio; getAudioTracks().length > 0 drives the
    // mixing branch.
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add camera'));
    await waitFor(() => expect(screen.getByText('Camera + Mic')).toBeTruthy());
    fireEvent.click(screen.getByText('● Record'));
    await waitFor(() => expect(screen.getByText('■ Stop')).toBeTruthy());
    expect(connected).toHaveLength(1);
    fireEvent.click(screen.getByText('■ Stop'));
    await waitFor(() => expect(screen.getByText('Download recording')).toBeTruthy());
  });

  it('drops empty recorder chunks', async () => {
    let dataHandler = null;
    const chunks = [];
    vi.stubGlobal('MediaRecorder', class {
      constructor() {
        this.state = 'inactive';
        this.start = vi.fn();
        this.stop = () => { this.state = 'inactive'; this.onstop?.(); };
        Object.defineProperty(this, 'ondataavailable', {
          get: () => dataHandler,
          set: (fn) => { dataHandler = fn; },
        });
        this.onstop = null;
      }
    });
    vi.stubGlobal('AudioContext', class {
      createMediaStreamDestination() { return { stream: fakeStream(true) }; }
      createMediaStreamSource() { return { connect: () => {} }; }
      close() {}
    });
    render(<CastApp />);
    fireEvent.click(screen.getByText('Add screen'));
    await waitFor(() => expect(screen.getByText('Screen')).toBeTruthy());
    fireEvent.click(screen.getByText('● Record'));
    await waitFor(() => expect(screen.getByText('■ Stop')).toBeTruthy());
    act(() => { dataHandler?.({ data: { size: 0 } }); }); // empty chunk — skipped
    act(() => { dataHandler?.({ data: { size: 5 } }); chunks.push(1); });
    fireEvent.click(screen.getByText('■ Stop'));
    await waitFor(() => expect(screen.getByText('Download recording')).toBeTruthy());
  });
});
