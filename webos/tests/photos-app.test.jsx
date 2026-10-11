// Photos app: folder navigation over the disk store, honest empty/not-found
// states, non-destructive transform state (rotate/flip/crop/zoom), and the
// save paths (original blob untouched; re-encode only when edited).
// imops.js pure math is covered in app-libs; here the browser pieces that
// happy-dom lacks (image decode, canvas, toBlob) are replaced at the seams.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';

const h = vi.hoisted(() => ({ files: [] }));

vi.mock('../src/os/db.js', () => ({
  fileList: async () => h.files,
  fileGet: async (path) => {
    const r = h.files.find((f) => f.path === path && !f.dir);
    return r ? { blob: r.blob, type: r.type } : null;
  },
  filePut: async (path, blob) => {
    h.files = h.files.filter((f) => f.path !== path);
    h.files.push({ path, dir: false, type: blob.type || 'image/png', size: blob.size, mtime: 1, blob });
  },
}));

import Photos from '../src/apps/photos/Photos.jsx';

let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};

// happy-dom never decodes images: FakeImage reports size and loads on microtask
class FakeImage {
  constructor() { this.naturalWidth = 4; this.naturalHeight = 3; }
  set src(v) { this._src = v; queueMicrotask(() => this.onload?.()); }
  get src() { return this._src; }
}

const pngBlob = (bytes = 'abcd') => new Blob([bytes], { type: 'image/png' });
const seed = (paths) => {
  h.files = paths.map((p) => ({ path: `/Home/${p}`, dir: false, type: 'image/png', size: 4, blob: pngBlob() }));
};

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  seed(['a.png', 'b.png']);
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('fetch', () => new Promise(() => {}));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ph');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  // recording 2d context: the draw effect must run against a working canvas
  const noop = () => {};
  const ctx2d = new Proxy({}, {
    get: (t, k) => (k === 'canvas' ? null : noop),
    set: () => true,
  });
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ctx2d, configurable: true, writable: true,
  });
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    value: (cb) => cb(new Blob(['enc'], { type: 'image/png' })), configurable: true, writable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete HTMLCanvasElement.prototype.getContext;
  delete HTMLCanvasElement.prototype.toBlob;
});

const mountPhotos = (args) => render(
  <OSProvider>
    <Probe />
    <Photos args={args} />
  </OSProvider>
);

const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const stage = () => screen.getByRole('application', { name: /Image viewer/ });

describe('Photos', () => {
  it('without a launch path it shows the honest empty pane', () => {
    mountPhotos();
    expect(screen.getByText('No image open — pick one in Files')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy(); // no counter
    expect(screen.getByLabelText('Previous image').disabled).toBe(true);
    expect(screen.getByLabelText('Next image').disabled).toBe(true);
    expect(screen.getByText('Save').disabled).toBe(true);
    expect(screen.getByText('Save copy').disabled).toBe(true);
    expect(screen.getByText('Crop').disabled).toBe(true);
  });

  it('opens the launched image inside its sorted folder strip', async () => {
    mountPhotos({ path: '/Home/b.png' });
    await settle();
    expect(screen.getByText('2 / 2')).toBeTruthy(); // b.png is second after sort
    expect(screen.getByText('b.png')).toBeTruthy();
    expect(screen.getByText('4×3 · 4 B')).toBeTruthy(); // decoded metadata
    expect(screen.getByLabelText('Next image').disabled).toBe(false);
    expect(screen.getByText('100%')).toBeTruthy(); // fit
    expect(screen.getByLabelText('b.png')).toBeTruthy(); // canvas
  });

  it('a missing or undecodable path reports honestly', async () => {
    mountPhotos({ path: '/Home/gone.png' });
    // the message shows in the pane and the status bar (role=status)
    expect((await screen.findByRole('status')).textContent).toBe('not found: gone.png');

    cleanup();
    vi.stubGlobal('Image', class { set src(_v) { queueMicrotask(() => this.onerror?.()); } });
    mountPhotos({ path: '/Home/b.png' });
    expect((await screen.findByRole('status')).textContent).toBe('cannot decode b.png');
  });

  it('arrow keys navigate the strip and wrap at the ends', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    await settle();
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByText('b.png')).toBeTruthy();
    fireEvent.keyDown(stage(), { key: 'ArrowRight' }); // wraps to the first
    await settle();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    fireEvent.keyDown(stage(), { key: 'ArrowLeft' }); // and back to the last
    await settle();
    expect(screen.getByText('2 / 2')).toBeTruthy();
  });

  it('zoom keys step the scale and Fit restores it', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.keyDown(stage(), { key: '+' });
    expect(screen.getByText('125%')).toBeTruthy();
    fireEvent.keyDown(stage(), { key: '-' });
    fireEvent.keyDown(stage(), { key: '-' });
    expect(screen.getByText('80%')).toBeTruthy(); // clamped at the 0.05 floor of fit=1
    fireEvent.click(screen.getByTitle('Fit to window (0)'));
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByTitle('Fit to window (0)').className).toContain('on');
  });

  it('transforms mark the image edited and Reset discards them', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    expect(screen.queryByText('edited')).toBeNull();
    expect(screen.getByText('Reset').disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Rotate right'));
    expect(screen.getByText('edited')).toBeTruthy();
    expect(screen.getByLabelText('Rotate right').className).toContain('on');
    expect(screen.getByText('Reset').disabled).toBe(false);

    fireEvent.click(screen.getByLabelText('Flip horizontal'));
    fireEvent.click(screen.getByLabelText('Rotate left')); // 90 - 90 → back to 0
    expect(screen.getByLabelText('Rotate left').className).not.toContain('on');
    expect(screen.getByLabelText('Rotate right').className).not.toContain('on');
    expect(screen.getByText('edited')).toBeTruthy(); // the flip still counts

    fireEvent.click(screen.getByText('Reset'));
    expect(screen.queryByText('edited')).toBeNull();
    expect(screen.getByText('Reset').disabled).toBe(true);
  });

  it('crop mode prompts, takes a drag rectangle, and clears on a click', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByText('Crop'));
    expect(screen.getByRole('status').textContent).toContain('Crop: drag a region');
    const pad = screen.getByLabelText(/Crop area/);

    // happy-dom rects are all-zero: pin the pad to a known 100×100 box
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, x: 0, y: 0, right: 100, bottom: 100, toJSON: () => {} });
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(pad, { clientX: 60, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(pad, { pointerId: 1 });
    expect(screen.getByText('Clear crop')).toBeTruthy(); // a real drag became the crop

    fireEvent.pointerDown(pad, { clientX: 30, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(pad, { pointerId: 1 }); // click without drag clears
    expect(screen.queryByText('Clear crop')).toBeNull();

    fireEvent.click(screen.getByText('Crop')); // leave crop mode
    expect(screen.queryByRole('status')).toBeNull(); // prompt gone
  });

  it('Escape exits crop mode', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByText('Crop'));
    expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.keyDown(stage(), { key: 'Escape' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('an unedited save writes the original blob back untouched', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    const original = h.files.find((f) => f.path === '/Home/a.png').blob;
    fireEvent.click(screen.getByText('Save'));
    await settle();
    const after = h.files.find((f) => f.path === '/Home/a.png').blob;
    expect(after).toBe(original); // same instance: pixels never re-encoded
    expect(screen.getByRole('status').textContent).toBe('saved a.png → Files');
  });

  it('Save copy re-encodes an edited image under a fresh name', async () => {
    mountPhotos({ path: '/Home/b.png' });
    await settle();
    fireEvent.click(screen.getByLabelText('Rotate right'));
    fireEvent.click(screen.getByText('Save copy'));
    await settle();
    expect(h.files.map((f) => f.path).sort()).toEqual(['/Home/a.png', '/Home/b-edited.png', '/Home/b.png']);
    const copy = h.files.find((f) => f.path === '/Home/b-edited.png');
    expect(copy.size).toBe(3); // the toBlob stub's payload: pixels were re-encoded
    // the viewer follows the copy: transforms reset, strip refreshed; the
    // transient "saved" status is cleared when the copy finishes loading
    expect(screen.getByText('2 / 3')).toBeTruthy(); // b-edited sorts between a and b
    expect(screen.getByText('b-edited.png')).toBeTruthy();
    expect(screen.queryByText('edited')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('the Files button opens the Files app', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByText('Files'));
    await act(async () => {});
    expect(cur.windows.some((w) => w.appId === 'files')).toBe(true);
  });
});
