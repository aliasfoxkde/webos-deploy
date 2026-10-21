// Photos — branch coverage for the paths the main photos spec never reaches:
// store failures and unmount races, root-level files, degenerate pointer
// input, keyboard-only navigation, encode quality, and the live-draft render.
//
// happy-dom cannot decode images or paint a canvas, so the browser seams are
// replaced the same way photos-app.test.jsx replaces them: a FakeImage that
// reports a size and loads on a microtask, a recording 2d context, and a
// toBlob stand-in that reports the requested mime type and quality.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';

const h = vi.hoisted(() => ({
  files: [],
  getFails: false,
  getGate: null,
  listGate: null,
  putGate: null,
  putThrows: undefined,
  putThrowsSet: false,
}));

vi.mock('../src/os/db.js', () => ({
  fileList: async () => {
    const gate = h.listGate;
    if (gate) { h.listGate = null; await gate.promise; }
    return h.files;
  },
  fileGet: async (path) => {
    const gate = h.getGate;
    if (gate) { h.getGate = null; await gate.promise; }
    if (h.getFails) throw new Error('store offline');
    const r = h.files.find((f) => f.path === path && !f.dir);
    return r ? { blob: r.blob, type: r.type } : null;
  },
  filePut: async (path, blob) => {
    const gate = h.putGate;
    if (gate) { h.putGate = null; await gate.promise; }
    if (h.putThrowsSet) throw h.putThrows;
    h.files = h.files.filter((f) => f.path !== path);
    h.files.push({ path, dir: false, type: blob.type || 'image/png', size: blob.size, mtime: 1, blob });
  },
}));

import Photos from '../src/apps/photos/Photos.jsx';

let os;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  os = useOS();
  return null;
};

// A promise the test resolves by hand — used to freeze the store mid-flight.
const deferred = () => {
  const box = {};
  box.promise = new Promise((res, rej) => { box.resolve = res; box.reject = rej; });
  return box;
};

class FakeImage {
  constructor() { this.naturalWidth = 4; this.naturalHeight = 3; FakeImage.last = this; }

  set src(v) {
    this._src = v;
    if (FakeImage.autoLoad) queueMicrotask(() => this.onload?.());
  }

  get src() { return this._src; }
}
FakeImage.last = null;
FakeImage.autoLoad = true;

const pngBlob = (bytes = 'abcd') => new Blob([bytes], { type: 'image/png' });
const seed = (paths) => {
  h.files = paths.map((p) => ({ path: p, dir: false, type: 'image/png', size: 4, blob: pngBlob() }));
};

const RECT = () => ({ left: 0, top: 0, width: 100, height: 100, x: 0, y: 0, right: 100, bottom: 100, toJSON: () => {} });

let ctxCalls = [];
let blobCalls = [];
let canvasEls = [];
let roCount = 0;
let dprDesc = null;
let widthDesc = null;
let heightDesc = null;

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  seed(['/Home/a.png', '/Home/b.png']);
  h.getFails = false;
  h.getGate = null;
  h.listGate = null;
  h.putGate = null;
  h.putThrows = undefined;
  h.putThrowsSet = false;
  ctxCalls = [];
  blobCalls = [];
  canvasEls = [];
  roCount = 0;
  FakeImage.autoLoad = true;
  FakeImage.last = null;

  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('fetch', () => new Promise(() => {}));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ph');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  class RecordingRO {
    constructor() { roCount += 1; }

    observe() {}

    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', RecordingRO);

  // recording 2d context: every call lands in ctxCalls as [name, ...args]
  const ctx2d = new Proxy({}, {
    get: (t, k) => {
      if (k === 'canvas') return null;
      if (k === 'getImageData') return (_x, _y, w, hhh) => ({ data: new Uint8ClampedArray(w * hhh * 4), width: w, height: hhh });
      return (...a) => { ctxCalls.push([k, ...a]); };
    },
    set: (t, k, v) => { ctxCalls.push([`set:${k}`, v]); return true; },
  });
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ctx2d, configurable: true, writable: true,
  });
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    value: (cb, type, quality) => {
      blobCalls.push({ type, quality });
      cb(new Blob(['enc'], { type: type || 'image/png' }));
    },
    configurable: true,
    writable: true,
  });

  // remember every canvas element so the save path's re-render can be measured
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, ...rest) => {
    const el = create(tag, ...rest);
    if (String(tag).toLowerCase() === 'canvas') canvasEls.push(el);
    return el;
  });

  dprDesc = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
  widthDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  heightDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete HTMLCanvasElement.prototype.getContext;
  delete HTMLCanvasElement.prototype.toBlob;
  if (dprDesc) Object.defineProperty(window, 'devicePixelRatio', dprDesc);
  else delete window.devicePixelRatio;
  if (widthDesc) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDesc);
  else delete HTMLElement.prototype.clientWidth;
  if (heightDesc) Object.defineProperty(HTMLElement.prototype, 'clientHeight', heightDesc);
  else delete HTMLElement.prototype.clientHeight;
});

const mountPhotos = (args) => render(
  <OSProvider>
    <Probe />
    <Photos args={args} />
  </OSProvider>
);

const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const stage = () => screen.getByRole('application', { name: /Image viewer/ });
const callNames = () => ctxCalls.map((c) => c[0]);
const pad = () => screen.getByLabelText(/Markup area|Crop area/);

describe('Photos — store and lifecycle branches', () => {
  it('a store that rejects the read reports the file as missing', async () => {
    h.getFails = true;
    mountPhotos({ path: '/Home/a.png' });
    expect((await screen.findByRole('status')).textContent).toBe('not found: a.png');
  });

  it('unmounting while the file is still loading creates no object URL', async () => {
    const gate = deferred();
    h.getGate = gate;
    const { unmount } = mountPhotos({ path: '/Home/a.png' });
    await settle(); // the listing resolved; the read is parked on the gate
    unmount();
    gate.resolve();
    await settle();
    expect(URL.createObjectURL).not.toHaveBeenCalled(); // the open bailed out
  });

  it('unmounting before the image decodes revokes the pending object URL', async () => {
    FakeImage.autoLoad = false;
    const { unmount } = mountPhotos({ path: '/Home/a.png' });
    await settle();
    const image = FakeImage.last;
    expect(image).toBeTruthy();
    unmount();
    image.onload();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:ph');
  });

  it('a blob with no mime type is reported as image/*', async () => {
    h.files = [{ path: '/Home/a.png', dir: false, type: 'image/png', size: 4, blob: new Blob(['abcd']) }];
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    expect(screen.getByTitle('image/*')).toBeTruthy();
  });

  it('relaunching on another path discards the listing of the previous one', async () => {
    const gate = deferred();
    h.listGate = gate;
    const view = render(
      <OSProvider>
        <Photos args={{ path: '/Home/a.png' }} />
      </OSProvider>
    );
    await settle(); // the first listing is parked on the gate
    view.rerender(
      <OSProvider>
        <Photos args={{ path: '/Home/b.png' }} />
      </OSProvider>
    );
    gate.resolve();
    await settle();
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByText('b.png')).toBeTruthy();
    // the abandoned launch never decoded its image: only b.png was opened
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('an image at the filesystem root lists and copies to the root', async () => {
    seed(['/a.png']);
    mountPhotos({ path: '/a.png' });
    await settle();
    expect(screen.getByText('1 / 1')).toBeTruthy();
    expect(screen.getByText('a.png')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Rotate right'));
    fireEvent.click(screen.getByText('Save copy'));
    await settle();
    expect(h.files.map((f) => f.path)).toContain('/a-edited.png');
    expect(screen.getByText('a-edited.png')).toBeTruthy();
  });
});

describe('Photos — navigation branches', () => {
  it('arrow keys with nothing open leave the empty pane alone', () => {
    mountPhotos();
    fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    expect(screen.getByText('No image open — pick one in Files')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('navigating to the image already shown is a no-op', async () => {
    seed(['/Home/a.png']);
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.keyDown(stage(), { key: 'ArrowLeft' });
    await settle();
    expect(screen.getByText('1 / 1')).toBeTruthy();
    expect(screen.getByText('a.png')).toBeTruthy();
  });

  it('the 0 key restores the fit scale and = zooms in', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.keyDown(stage(), { key: '=' });
    expect(screen.getByText('125%')).toBeTruthy();
    fireEvent.keyDown(stage(), { key: '0' });
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByTitle('Fit to window (0)').className).toContain('on');
    fireEvent.keyDown(stage(), { key: '-' });
    expect(screen.getByText('80%')).toBeTruthy();
  });
});

describe('Photos — stage sizing branches', () => {
  it('without ResizeObserver the viewer skips observation and still renders', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    expect(roCount).toBe(0); // no observer was constructed
    expect(screen.getByText('100%')).toBeTruthy(); // and the viewer still works
  });

  it('a measurable stage scales the image to fit the window', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { get: () => 400, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { get: () => 300, configurable: true });
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    // fit = min((400-24)/4, (300-24)/3) = 92
    expect(screen.getByText('9200%')).toBeTruthy();
  });

  it('a zero device pixel ratio still paints one device pixel per CSS pixel', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 0, configurable: true });
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    const canvas = screen.getByLabelText('a.png');
    expect(canvas.width).toBe(4); // 4 CSS px × dpr 1 — never dpr 0
  });
});

describe('Photos — pointer branches', () => {
  it('an unsized pad clamps the pointer to the origin', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByText('Crop'));
    const area = screen.getByLabelText(/Crop area/);
    // happy-dom reports a zero-sized box: every point maps to [0, 0]
    fireEvent.pointerDown(area, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 80, clientY: 80, pointerId: 1 });
    const rect = document.querySelector('.ph-crop-rect');
    expect(rect.style.left).toBe('0%');
    expect(rect.style.width).toBe('0%');
  });

  it('moving without pressing starts neither a crop nor a stroke', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByText('Crop'));
    const area = screen.getByLabelText(/Crop area/);
    area.getBoundingClientRect = RECT;
    fireEvent.pointerMove(area, { clientX: 60, clientY: 50, pointerId: 1 });
    expect(document.querySelector('.ph-crop-rect')).toBeNull();
    expect(screen.queryByText('Clear crop')).toBeNull();
  });

  it('releasing without pressing crops nothing', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByText('Crop'));
    const area = screen.getByLabelText(/Crop area/);
    area.getBoundingClientRect = RECT;
    fireEvent.pointerUp(area, { pointerId: 1 });
    expect(screen.queryByText('Clear crop')).toBeNull();
  });

  it('moving and releasing without pressing annotates nothing', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByTitle('Markup — draw on the image'));
    fireEvent.click(screen.getByLabelText('Pen'));
    const area = pad();
    area.getBoundingClientRect = RECT;
    fireEvent.pointerMove(area, { clientX: 40, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(area, { pointerId: 1 });
    expect(screen.getByLabelText('Undo last annotation').disabled).toBe(true);
  });

  it('a stray release after leaving crop mode annotates nothing', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByText('Crop'));
    const area = screen.getByLabelText(/Crop area/);
    area.getBoundingClientRect = RECT;
    fireEvent.pointerDown(area, { clientX: 10, clientY: 10, pointerId: 1 }); // starts a crop drag
    fireEvent.keyDown(stage(), { key: 'Escape' }); // leaves crop mode
    fireEvent.click(screen.getByTitle('Markup — draw on the image'));
    fireEvent.click(screen.getByLabelText('Pen'));
    const area2 = pad();
    area2.getBoundingClientRect = RECT;
    fireEvent.pointerUp(area2, { pointerId: 1 }); // a release with no stroke behind it
    expect(screen.getByLabelText('Undo last annotation').disabled).toBe(true);
  });

  it('a vertical line drag is long enough to commit', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByTitle('Markup — draw on the image'));
    fireEvent.click(screen.getByLabelText('Line'));
    const area = pad();
    area.getBoundingClientRect = RECT;
    fireEvent.pointerDown(area, { clientX: 50, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 50, clientY: 80, pointerId: 1 }); // no x movement at all
    fireEvent.pointerUp(area, { pointerId: 1 });
    expect(screen.getByLabelText('Undo last annotation').disabled).toBe(false);
  });

  it('the crop rectangle is marked live while it is being dragged', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByText('Crop'));
    const area = screen.getByLabelText(/Crop area/);
    area.getBoundingClientRect = RECT;
    fireEvent.pointerDown(area, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 60, clientY: 50, pointerId: 1 });
    const rect = document.querySelector('.ph-crop-rect');
    expect(rect.className).toContain('live');
    expect(rect.style.left).toBe('10%');
    expect(rect.style.width).toBe('50%');
  });

  it('a filled ellipse is filled while it is being drawn', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByTitle('Markup — draw on the image'));
    fireEvent.click(screen.getByLabelText('Ellipse'));
    const area = pad();
    area.getBoundingClientRect = RECT;
    ctxCalls = [];
    fireEvent.pointerDown(area, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 70, clientY: 60, pointerId: 1 });
    expect(callNames()).toContain('ellipse');
    expect(callNames()).not.toContain('fill'); // Fill is off

    fireEvent.click(screen.getByLabelText('Fill shapes'));
    ctxCalls = [];
    fireEvent.pointerMove(area, { clientX: 72, clientY: 62, pointerId: 1 });
    expect(callNames()).toContain('fill'); // the live draft is filled
  });
});

describe('Photos — markup control branches', () => {
  it('an empty text label is discarded', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByTitle('Markup — draw on the image'));
    fireEvent.click(screen.getByLabelText('Text'));
    const area = pad();
    area.getBoundingClientRect = RECT;
    fireEvent.pointerDown(area, { clientX: 30, clientY: 40, pointerId: 1 });
    const input = screen.getByLabelText('Annotation text');
    fireEvent.keyDown(input, { key: 'Enter', bubbles: true });
    expect(screen.queryByLabelText('Annotation text')).toBeNull();
    expect(screen.getByLabelText('Undo last annotation').disabled).toBe(true);
  });

  it('Ctrl+Z with nothing to undo is not prevented', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    // the handler only swallows the key when it actually undid something
    expect(fireEvent.keyDown(stage(), { key: 'z', ctrlKey: true })).toBe(true);
    expect(screen.queryByText('edited')).toBeNull();
  });

  it('Ctrl+Z with an annotation to undo swallows the key', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByTitle('Markup — draw on the image'));
    fireEvent.click(screen.getByLabelText('Pen'));
    const area = pad();
    area.getBoundingClientRect = RECT;
    fireEvent.pointerDown(area, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 40, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(area, { pointerId: 1 });
    expect(fireEvent.keyDown(stage(), { key: 'z', ctrlKey: true })).toBe(false);
  });

  it('clicking the active tool again turns it off', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByTitle('Markup — draw on the image'));
    const pen = screen.getByLabelText('Pen');
    fireEvent.click(pen);
    expect(pen.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain('Pen: drag to draw');
    fireEvent.click(pen);
    expect(pen.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByLabelText(/Markup area/)).toBeNull();
  });

  it('rotating left shows the quarter-turn state', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByLabelText('Rotate left'));
    expect(screen.getByLabelText('Rotate left').className).toContain('on');
    expect(screen.getByText('edited')).toBeTruthy();
  });

  it('clicking Markup again closes the panel, and so does Adjust', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByTitle('Markup — draw on the image'));
    expect(screen.getByRole('toolbar', { name: 'Markup tools' })).toBeTruthy();
    fireEvent.click(screen.getByTitle('Markup — draw on the image'));
    expect(screen.queryByRole('toolbar', { name: 'Markup tools' })).toBeNull();

    fireEvent.click(screen.getByTitle('Exposure, contrast, saturation'));
    expect(screen.getByRole('group', { name: 'Image adjustments' })).toBeTruthy();
    fireEvent.click(screen.getByTitle('Exposure, contrast, saturation'));
    expect(screen.queryByRole('group', { name: 'Image adjustments' })).toBeNull();
  });
});

describe('Photos — save branches', () => {
  it('a jpeg edit is encoded at quality 0.92 and a png at the default', async () => {
    seed(['/Home/x.jpg', '/Home/y.png']);
    mountPhotos({ path: '/Home/x.jpg' });
    await settle();
    fireEvent.click(screen.getByLabelText('Rotate right'));
    fireEvent.click(screen.getByText('Save'));
    await settle();
    expect(blobCalls.at(-1)).toEqual({ type: 'image/jpeg', quality: 0.92 });

    cleanup();
    mountPhotos({ path: '/Home/y.png' });
    await settle();
    fireEvent.click(screen.getByLabelText('Rotate right'));
    fireEvent.click(screen.getByText('Save'));
    await settle();
    expect(blobCalls.at(-1)).toEqual({ type: 'image/png', quality: undefined });
  });

  it('a cropped image is re-rendered from the crop when saved', async () => {
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByText('Crop'));
    const area = screen.getByLabelText(/Crop area/);
    area.getBoundingClientRect = RECT;
    fireEvent.pointerDown(area, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 60, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(area, { pointerId: 1 });

    fireEvent.click(screen.getByText('Save'));
    await settle();
    const sizes = canvasEls.map((c) => [c.width, c.height]);
    // the crop is 0.5 × 0.4 of a 4 × 3 image → a 2 × 1 canvas was painted
    expect(sizes).toContainEqual([2, 1]);
  });

  it('a write failure that is not an Error is reported with its raw value', async () => {
    h.putThrowsSet = true;
    h.putThrows = 'disk offline';
    mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByText('Save'));
    await settle();
    expect(screen.getByRole('status').textContent).toBe('save failed: disk offline');
  });

  it('unmounting while a save is in flight writes the file without complaint', async () => {
    const gate = deferred();
    h.putGate = gate;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = mountPhotos({ path: '/Home/a.png' });
    await settle();
    fireEvent.click(screen.getByText('Save'));
    await settle();
    unmount();
    gate.resolve();
    await settle();
    expect(err).not.toHaveBeenCalled();
    expect(h.files.find((f) => f.path === '/Home/a.png').size).toBe(4); // the original, untouched
  });

  it('unmounting while a copy is being listed writes the copy without complaint', async () => {
    const gate = deferred();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = mountPhotos({ path: '/Home/a.png' });
    await settle();
    h.listGate = gate; // the copy's listing parks here
    fireEvent.click(screen.getByText('Save copy'));
    await settle();
    unmount();
    gate.resolve();
    await settle();
    expect(err).not.toHaveBeenCalled();
    expect(h.files.map((f) => f.path)).toContain('/Home/a-edited.png');
  });

  it('the Files button does nothing when no image is open', async () => {
    mountPhotos();
    fireEvent.click(screen.getByText('Files'));
    await act(async () => {});
    expect(os.windows.some((w) => w.appId === 'files')).toBe(false);
  });
});
