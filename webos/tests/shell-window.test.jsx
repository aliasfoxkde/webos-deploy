// Shell: Window chrome (focus, min/max/close, resize handles, drag-to-snap,
// tear-off, lazy plugin loading), EmbedFrame (embed vs honest blocked panel,
// bridge source pinning), Screensaver (preview, wake thresholds, idle timer),
// Sidebar widgets, and the FxWallpaper canvas effects.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';
import Window from '../src/shell/Window.jsx';
import EmbedFrame from '../src/shell/EmbedFrame.jsx';
import Screensaver from '../src/shell/Screensaver.jsx';
import Sidebar from '../src/shell/Sidebar.jsx';
import FxWallpaper from '../src/shell/FxWallpaper.jsx';
import { WALLPAPERS } from '../src/os/wallpapers.js';
import { STORE_APPS } from '../src/os/registry.js';

// The file bridge is mocked at the boundary: EmbedFrame must decide WHICH
// frame may talk to it (source pinning) before bridge logic ever runs.
vi.mock('../src/os/bridge.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleBridge: vi.fn(async () => ({ id: 1, ok: true })),
}));
import { handleBridge } from '../src/os/bridge.js';

let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};
const mount = (ui) => render(<OSProvider><Probe />{ui}</OSProvider>);
const noop = () => {};

/* ---- canvas: a recording 2d context so FX draws run headless ---- */
let ctx2d;
const makeCtx = () => {
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    setTransform: rec('setTransform'), fillRect: rec('fillRect'),
    beginPath: rec('beginPath'), arc: rec('arc'), fill: rec('fill'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), stroke: rec('stroke'),
    closePath: rec('closePath'),
    fillText: rec('fillText'),
    createLinearGradient: () => ({ addColorStop: rec('addColorStop') }),
  };
};

let rafCalls;
const cancelSpy = vi.fn();
const rafCb = () => rafCalls[rafCalls.length - 1];

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  document.body.className = '';
  document.body.removeAttribute('data-persona');
  ctx2d = makeCtx();
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: vi.fn(() => ctx2d), configurable: true, writable: true,
  });
  rafCalls = [];
  cancelSpy.mockClear();
  vi.stubGlobal('requestAnimationFrame', (cb) => { rafCalls.push(cb); return 40 + rafCalls.length; });
  vi.stubGlobal('cancelAnimationFrame', cancelSpy);
  vi.stubGlobal('fetch', () => new Promise(() => {})); // iframes must not hit the network
  handleBridge.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete navigator.getBattery;
  delete navigator.storage;
});

describe('Window', () => {
  // Renders the topmost provider window so actions that change provider
  // state (snap, max, close) re-render the real thing, not a stale prop.
  const WinHost = () => {
    const os = useOS();
    return os.windows.map((win) => <Window key={win.id} win={win} />);
  };
  const mountApp = (appId) => {
    const c = mount(<WinHost />);
    if (STORE_APPS.some((a) => a.id === appId)) act(() => cur.install(appId));
    act(() => cur.launch(appId));
    return c;
  };

  it('embed apps render full chrome: icon, name, version, ext link', () => {
    const c = mountApp('cadcraft');
    const win = cur.windows[0];
    const sec = c.container.querySelector('section.win');
    expect(sec.getAttribute('data-id')).toBe(String(win.id));
    expect(sec.getAttribute('aria-label')).toBe('CADCraft');
    expect(sec.className).toContain('focused'); // launch focuses
    expect(c.container.querySelector('.titlebar img').getAttribute('src')).toContain('cadcraft');
    expect(c.container.querySelector('.titlebar .t').textContent).toContain('CADCraft');
    expect(c.container.querySelector('.titlebar .t small').textContent).toBe(`v0.3.0`);
    expect(c.container.querySelector('.tb-btn.ext')).toBeTruthy();
    expect(c.container.querySelector('.win-body').style.getPropertyValue('--win-accent')).toBeTruthy();
  });

  it('plugin windows lazy-load through Suspense', async () => {
    const c = mountApp('calc');
    expect(c.container.textContent).toContain('Starting Calculator…');
    // the lazy chunk resolves in a macrotask — waitFor drains it inside act
    await c.findByText('Standard', {}, { timeout: 5_000 }); // calculator mode tabs
    expect(c.container.textContent).not.toContain('Starting Calculator…');
  });

  it('embed body: iframe with source and permissions; load clears the overlay', () => {
    const c = mountApp('cadcraft');
    expect(c.container.querySelector('.win-loading').textContent).toContain('Starting CADCraft…');
    const frame = c.container.querySelector('iframe');
    expect(frame.getAttribute('src')).toBe('https://cadcraft-web.pages.dev/');
    expect(frame.getAttribute('title')).toBe('CADCraft');
    expect(frame.getAttribute('allow')).toContain('fullscreen');
    fireEvent.load(frame);
    expect(c.container.querySelector('.win-loading')).toBeNull();
  });

  it('a still-loading embed escalates to the slow-connection message at 30s', () => {
    vi.useFakeTimers();
    try {
      const c = mountApp('cadcraft');
      act(() => { vi.advanceTimersByTime(30_000); });
      expect(c.container.querySelector('.win-loading').textContent)
        .toContain('Still loading — check your connection.');
      fireEvent.load(c.container.querySelector('iframe'));
      expect(c.container.querySelector('.win-loading')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the ext button opens the site in a new tab', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const c = mountApp('cadcraft');
    fireEvent.click(c.container.querySelector('.tb-btn.ext'));
    expect(openSpy).toHaveBeenCalledWith('https://cadcraft-web.pages.dev/', '_blank', 'noopener');
  });

  it('minimize hides the window; maximize/restore; close removes it', () => {
    const c = mountApp('calc');
    fireEvent.click(c.container.querySelector('.tb-btn.min'));
    expect(cur.windows[0].min).toBe(true);
    expect(c.container.querySelector('section.win').style.display).toBe('none');
    fireEvent.click(c.container.querySelector('.tb-btn.max'));
    expect(cur.windows[0].max).toBe(true);
    expect(c.container.querySelector('section.win').className).toContain('maximized');
    expect(c.container.querySelector('.tb-btn.max').title).toBe('Restore');
    fireEvent.click(c.container.querySelector('.tb-btn.max'));
    expect(cur.windows[0].max).toBe(false);
    fireEvent.click(c.container.querySelector('.tb-btn.close'));
    expect(cur.windows).toHaveLength(0);
    expect(c.container.querySelector('section.win')).toBeNull();
  });

  it('pointerdown anywhere in an unfocused window focuses it', () => {
    const c = mountApp('calc');
    act(() => cur.launch('calc')); // second instance takes focus
    const first = cur.windows[0].id;
    expect(cur.focused).toBe(cur.windows[1].id);
    fireEvent.pointerDown(c.container.querySelector(`section.win[data-id="${first}"]`));
    expect(cur.focused).toBe(first);
  });

  it('eight resize handles when floating, none when maximized', () => {
    const c = mountApp('calc');
    expect(c.container.querySelectorAll('.rz')).toHaveLength(8);
    fireEvent.click(c.container.querySelector('.tb-btn.max'));
    expect(c.container.querySelectorAll('.rz')).toHaveLength(0);
  });

  it('east drag widens; west drag pins the right edge and clamps at the minimum', () => {
    const c = mountApp('calc');
    const start = { ...cur.windows[0].rect };
    const rzE = c.container.querySelector('.rz-e');
    fireEvent.pointerDown(rzE, { button: 0, clientX: start.x + start.w, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: start.x + start.w + 80, clientY: 300 });
    expect(cur.windows[0].rect.w).toBe(start.w + 80);
    fireEvent.pointerUp(window);

    // west: moving the left edge right shrinks; the right edge stays put
    const r1 = { ...cur.windows[0].rect };
    fireEvent.pointerDown(c.container.querySelector('.rz-w'), { button: 0, clientX: r1.x, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: r1.x + 50, clientY: 300 });
    expect(cur.windows[0].rect.w).toBe(r1.w - 50);
    expect(r1.x + r1.w).toBe(cur.windows[0].rect.x + cur.windows[0].rect.w);
    fireEvent.pointerUp(window);

    // dragging the west edge far past the body clamps at 320 without inverting
    const r2 = { ...cur.windows[0].rect };
    fireEvent.pointerDown(c.container.querySelector('.rz-w'), { button: 0, clientX: r2.x, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: r2.x + 2000, clientY: 300 });
    expect(cur.windows[0].rect.w).toBe(320);
    expect(cur.windows[0].rect.x).toBe(r2.x + r2.w - 320);
    fireEvent.pointerUp(window);
  });

  it('titlebar drag moves the window; a drop on the left edge tiles it', () => {
    const c = mountApp('calc');
    const start = { ...cur.windows[0].rect };
    const header = c.container.querySelector('.titlebar');
    fireEvent.pointerDown(header, { button: 0, clientX: start.x + 60, clientY: start.y + 14 });
    fireEvent.pointerMove(window, { clientX: 5, clientY: 400 }); // left edge zone
    const preview = document.querySelector('#snap-preview');
    expect(preview).toBeTruthy();
    expect(preview.style.width).toBe('512px'); // half of the 1024px viewport
    fireEvent.pointerUp(window);
    expect(document.querySelector('#snap-preview')).toBeNull();
    const win = cur.windows[0];
    expect(win.snap).toBe('left');
    expect(win.max).toBe(false);
    expect(win.rect).toEqual({ x: 0, y: 0, w: 512, h: 768 });
    // pre keeps the floating SIZE for restore (its position is wherever the
    // drag left the window at drop time)
    expect(win.pre.w).toBe(start.w);
    expect(win.pre.h).toBe(start.h);
  });

  it('a drop on the top edge maximizes and shows no side preview', () => {
    const c = mountApp('calc');
    const start = { ...cur.windows[0].rect };
    fireEvent.pointerDown(c.container.querySelector('.titlebar'), { button: 0, clientX: start.x + 60, clientY: start.y + 14 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 4 }); // top zone
    expect(document.querySelector('#snap-preview')).toBeNull(); // top = maximize, no preview
    fireEvent.pointerUp(window);
    expect(cur.windows[0].max).toBe(true);
  });

  it('dragging a maximized window tears it off at the floating size', () => {
    const c = mountApp('calc');
    const floating = { ...cur.windows[0].rect };
    act(() => cur.toggleMax(cur.windows[0].id));
    expect(cur.windows[0].max).toBe(true);
    fireEvent.pointerDown(c.container.querySelector('.titlebar'), { button: 0, clientX: 500, clientY: 16 });
    fireEvent.pointerMove(window, { clientX: 520, clientY: 40 });
    expect(cur.windows[0].max).toBe(false); // torn off on the first move
    expect(cur.windows[0].rect.w).toBe(floating.w); // torn back to floating size
    fireEvent.pointerUp(window);
    expect(cur.windows[0].max).toBe(false);
  });

  it('dragging a tiled window tears off to the pre-tile floating rect', () => {
    const c = mountApp('calc');
    const floating = { ...cur.windows[0].rect };
    act(() => cur.snap(cur.windows[0].id, 'left'));
    expect(cur.windows[0].snap).toBe('left');
    fireEvent.pointerDown(c.container.querySelector('.titlebar'), { button: 0, clientX: 200, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 320 });
    expect(cur.windows[0].snap).toBeNull(); // setRect on a manual move clears it
    expect(cur.windows[0].rect.w).toBe(floating.w);
    fireEvent.pointerUp(window);
  });

  it('double-clicking the titlebar toggles maximize; buttons never drag', () => {
    const c = mountApp('calc');
    fireEvent.dblClick(c.container.querySelector('.titlebar'));
    expect(cur.windows[0].max).toBe(true);
    fireEvent.dblClick(c.container.querySelector('.titlebar'));
    expect(cur.windows[0].max).toBe(false);
    // pointerdown on a chrome button starts no gesture
    const rect = { ...cur.windows[0].rect };
    fireEvent.pointerDown(c.container.querySelector('.tb-btn.close'));
    fireEvent.pointerMove(window, { clientX: rect.x + 900, clientY: 900 });
    expect(cur.windows[0].rect).toEqual(rect);
  });

  it('unknown app ids render nothing', () => {
    const c = render(
      <OSProvider>
        <Window win={{ id: 99, appId: 'ghost', rect: { x: 0, y: 0, w: 400, h: 300 }, z: 1 }} />
      </OSProvider>
    );
    expect(c.container.querySelector('section.win')).toBeNull();
  });
});

describe('EmbedFrame', () => {
  const blockedApp = {
    id: 'user-blocked', name: 'Stubborn Site', url: 'https://stubborn.example',
    icon: 'icons/custom.svg', accent: '#38bdf8', version: '1.0', embed: false,
  };
  const embedApp = {
    id: 'user-friendly', name: 'Friendly Site', url: 'https://friendly.example/app',
    icon: 'icons/custom.svg', accent: '#38bdf8', version: '1.0', embed: true,
  };

  it('non-embed apps get the honest blocked panel with two real exits', () => {
    const c = mount(<EmbedFrame app={blockedApp} />);
    expect(c.container.querySelector('h3').textContent).toBe('Stubborn Site');
    expect(c.container.textContent).toContain('X-Frame-Options');
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    fireEvent.click(c.container.querySelector('.btn.accent'));
    expect(cur.windows[cur.windows.length - 1].appId).toBe('browser');
    expect(cur.windows[cur.windows.length - 1].args).toEqual({ url: 'https://stubborn.example' });
    fireEvent.click([...c.container.querySelectorAll('button')].find((b) => b.textContent.includes('new tab')));
    expect(openSpy).toHaveBeenCalledWith('https://stubborn.example', '_blank', 'noopener');
  });

  it('embed apps render a live frame; onLoad reports readiness', () => {
    const onLoaded = vi.fn();
    const c = mount(<EmbedFrame app={embedApp} onLoaded={onLoaded} />);
    const frame = c.container.querySelector('iframe');
    expect(frame.getAttribute('src')).toBe('https://friendly.example/app');
    expect(frame.getAttribute('title')).toBe('Friendly Site');
    expect(onLoaded).not.toHaveBeenCalled();
    fireEvent.load(frame);
    expect(onLoaded).toHaveBeenCalledOnce();
  });

  it('the file bridge answers only messages authored by this frame', async () => {
    const c = mount(<EmbedFrame app={embedApp} />);
    const frame = c.container.querySelector('frame, iframe');
    const postSpy = vi.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {});

    // a sibling frame impersonating the app is ignored outright
    const impostor = new MessageEvent('message', { data: { type: 'webos:file-get', id: 7 } });
    Object.defineProperty(impostor, 'source', { value: {} });
    fireEvent(window, impostor);
    await act(async () => {});
    expect(handleBridge).not.toHaveBeenCalled();
    expect(postSpy).not.toHaveBeenCalled();

    // the frame itself gets its request served and the reply posted back
    const real = new MessageEvent('message', { data: { type: 'webos:file-list', id: 8 } });
    Object.defineProperty(real, 'source', { value: frame.contentWindow });
    fireEvent(window, real);
    await act(async () => {});
    expect(handleBridge).toHaveBeenCalledOnce();
    expect(handleBridge.mock.calls[0][1]).toMatchObject({ id: 'user-friendly' });
    expect(postSpy).toHaveBeenCalledWith({ id: 1, ok: true }, 'https://friendly.example');
  });
});

describe('Screensaver', () => {
  const activate = (kind) => {
    act(() => cur.setSaver({ kind }));
    act(() => { window.dispatchEvent(new Event('webos:saver-preview')); });
  };

  it('kind off never activates, not even on preview', () => {
    const c = mount(<Screensaver />);
    activate('off');
    expect(c.container.querySelector('#screensaver')).toBeNull();
  });

  it('preview activates immediately; a key or button press dismisses', () => {
    const c = mount(<Screensaver />);
    activate('clock');
    const saver = c.container.querySelector('#screensaver');
    expect(saver.getAttribute('role')).toBe('timer');
    expect(saver.querySelector('.saver-time').textContent).toMatch(/\d{1,2}:\d{2}/);
    expect(saver.querySelector('.saver-hint').textContent).toContain('press a key');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(c.container.querySelector('#screensaver')).toBeNull();
    activate('clock');
    expect(c.container.querySelector('#screensaver')).toBeTruthy();
    fireEvent.pointerDown(window);
    expect(c.container.querySelector('#screensaver')).toBeNull();
  });

  it('a plain pointermove must exceed 24px of travel to dismiss', () => {
    const c = mount(<Screensaver />);
    activate('clock');
    fireEvent.pointerMove(window, { clientX: 400, clientY: 300 }); // seeds the start point
    expect(c.container.querySelector('#screensaver')).toBeTruthy();
    fireEvent.pointerMove(window, { clientX: 414, clientY: 300 }); // 14px: jitter
    expect(c.container.querySelector('#screensaver')).toBeTruthy();
    fireEvent.pointerMove(window, { clientX: 430, clientY: 300 }); // 30px total: wake
    expect(c.container.querySelector('#screensaver')).toBeNull();
  });

  it('fx kinds draw the canvas wallpaper, including legacy tide/rain prefs', () => {
    for (const kind of ['starfield', 'aurora', 'waves', 'mesh', 'matrix', 'tide', 'rain']) {
      const c = mount(<Screensaver />);
      activate(kind);
      expect(c.container.querySelector('#screensaver canvas#saver-fx')).toBeTruthy();
      expect(rafCalls.length).toBeGreaterThan(0); // animation loop armed
      act(() => { rafCb()(16); });
      expect(ctx2d.calls.some(([n]) => n === 'fillRect')).toBe(true);
      cleanup();
    }
  });

  it('photo shuffle renders the bundled photos and advances on its timer', () => {
    vi.useFakeTimers();
    try {
      const photos = WALLPAPERS.filter((w) => w.img);
      const c = mount(<Screensaver />);
      activate('photos');
      const bg = () => c.container.querySelector('.saver-photo').style.backgroundImage;
      expect(bg()).toContain(photos[0].img);
      act(() => { vi.advanceTimersByTime(8_000); });
      expect(bg()).toContain(photos[1 % photos.length].img);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the idle timer starts the saver; input defers it', () => {
    vi.useFakeTimers();
    try {
      const c = mount(<Screensaver />);
      act(() => cur.setSaver({ kind: 'clock', timeoutMin: 2 }));
      act(() => { vi.advanceTimersByTime(120_500); });
      expect(c.container.querySelector('#screensaver')).toBeTruthy();

      // fresh tree: activity bumps the idle clock, deferring activation
      cleanup();
      const c2 = mount(<Screensaver />);
      act(() => cur.setSaver({ kind: 'clock', timeoutMin: 2 }));
      fireEvent.pointerMove(window, { clientX: 10, clientY: 10 });
      act(() => { vi.advanceTimersByTime(60_000); });
      expect(c2.container.querySelector('#screensaver')).toBeNull();
      act(() => { vi.advanceTimersByTime(61_000); }); // 121s since last input
      expect(c2.container.querySelector('#screensaver')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Sidebar', () => {
  it('renders the enabled widgets in order; the close button hands off', () => {
    const onClose = vi.fn();
    const c = mount(<Sidebar onClose={onClose} />);
    const titles = [...c.container.querySelectorAll('.widget-title')].map((t) => t.textContent);
    expect(titles).toEqual(['Weather', 'Battery', 'Today', 'Notes', 'Storage', 'AI Chat']); // clock has no title row
    expect(c.container.querySelectorAll('.sb-slot')).toHaveLength(7);
    fireEvent.click(c.container.querySelector('.tb-btn.close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clock widget ticks and honors the 24h preference', () => {
    const c = mount(<Sidebar />);
    expect(c.container.querySelector('.widget-clock').textContent).toMatch(/\d{1,2}:\d{2}/);
    act(() => cur.setTaskbar({ clock24: true }));
    expect(c.container.querySelector('.widget-clock').textContent).not.toMatch(/(AM|PM)/i);
  });

  it('weather widget without a location offers to set one', () => {
    const c = mount(<Sidebar />);
    fireEvent.click([...c.container.querySelectorAll('button')].find((b) => b.textContent === 'Set location…'));
    expect(cur.windows[cur.windows.length - 1].appId).toBe('weather');
  });

  it('battery widget tolerates a missing API and renders live values', async () => {
    const bare = mount(<Sidebar />);
    expect(bare.container.textContent).toContain('No battery API'); // regression: crashed without the API
    cleanup();
    navigator.getBattery = () => Promise.resolve({
      level: 0.8, charging: true,
      addEventListener: noop, removeEventListener: noop,
    });
    const c = mount(<Sidebar />);
    await act(async () => {});
    expect(c.container.querySelector('.widget-batt-fill.chg').style.width).toBe('80%');
    expect(c.container.textContent).toContain('80% · charging');
  });

  it('storage widget reports usage when the manager exists', async () => {
    const bare = mount(<Sidebar />);
    expect(bare.container.textContent).toContain('Storage manager unavailable.');
    cleanup();
    navigator.storage = { estimate: () => Promise.resolve({ usage: 10485760, quota: 104857600 }) };
    const c = mount(<Sidebar />);
    await act(async () => {});
    expect(c.container.textContent).toContain('10.0 MB used of 100.0 MB (10.0%)');
  });

  it('notes widget debounces drafts into localStorage', () => {
    vi.useFakeTimers();
    try {
      const c = mount(<Sidebar />);
      const ta = c.container.querySelector('.widget-notes');
      fireEvent.change(ta, { target: { value: 'hello' } });
      expect(localStorage.getItem('webos.notes')).toBeNull(); // not yet — 300ms debounce
      act(() => { vi.advanceTimersByTime(400); });
      expect(localStorage.getItem('webos.notes')).toBe('hello');
    } finally {
      vi.useRealTimers();
    }
  });

  it('events widget lists today; chat widget shows the last turns and clears', () => {
    localStorage.setItem('webos.chat.history', JSON.stringify([
      { id: 'a', role: 'user', text: 'hi' },
      { id: 'b', role: 'assistant', text: 'x'.repeat(120) }, // long text is truncated
      { id: 'c', role: 'user', text: 'bye' },
    ]));
    const c = mount(<Sidebar />);
    const today = new Date().toISOString().slice(0, 10);
    expect(c.container.textContent).toContain('No events today.');
    act(() => cur.addEvent(today, 'Standup'));
    expect([...c.container.querySelectorAll('.widget-ev')].map((d) => d.textContent)).toEqual(['Standup']);

    const msgs = [...c.container.querySelectorAll('.widget-chat-msg')];
    expect(msgs).toHaveLength(3);
    expect(msgs[1].textContent.endsWith('…')).toBe(true);
    fireEvent.click([...c.container.querySelectorAll('button')].find((b) => b.textContent === 'Clear'));
    expect(c.container.textContent).toContain('No conversation yet.');
    expect(localStorage.getItem('webos.chat.history')).toBeNull();
  });

  it('customize: reorder, hide, and re-add widgets', () => {
    const c = mount(<Sidebar />);
    expect(c.container.textContent).not.toContain('Add widgets');
    fireEvent.click([...c.container.querySelectorAll('.sb-head button')]
      .find((b) => b.textContent === 'Customize'));
    expect(c.container.textContent).toContain('Add widgets');
    expect(c.container.querySelectorAll('.sb-chips .chip')).toHaveLength(7);
    expect(c.container.querySelectorAll('.sb-slot')).toHaveLength(7); // one edit row each

    // boundary buttons disabled; the first slot can only move down
    const firstRow = c.container.querySelector('.sb-slot .sb-edit');
    expect(firstRow.querySelector('[title="Move up"]').disabled).toBe(true);
    expect(firstRow.querySelector('[title="Move down"]').disabled).toBe(false);
    expect(cur.widgets.enabled[0]).toBe('weather');
    fireEvent.click(firstRow.querySelector('[title="Move down"]'));
    expect(cur.widgets.enabled[0]).toBe('clock');
    expect(cur.widgets.enabled[1]).toBe('weather'); // weather's row is now second
    expect(c.container.querySelector('.sb-slot:nth-child(2) .sb-edit [title="Move up"]').disabled).toBe(false);

    fireEvent.click(c.container.querySelector('[title="Hide Weather"]'));
    expect(cur.widgets.enabled).not.toContain('weather');
    expect(c.container.querySelectorAll('.sb-slot')).toHaveLength(6);

    // the footer chip re-adds it at the end
    fireEvent.click([...c.container.querySelectorAll('.sb-chips .chip')]
      .find((b) => b.textContent === 'Weather'));
    expect(cur.widgets.enabled[cur.widgets.enabled.length - 1]).toBe('weather');
  });

  it('an empty sidebar explains itself', () => {
    const c = mount(<Sidebar onClose={noop} />);
    act(() => cur.setWidgets({ enabled: [] }));
    expect(c.container.textContent).toContain('No widgets enabled');
    expect(c.container.querySelectorAll('.sb-slot')).toHaveLength(0);
  });
});

describe('FxWallpaper', () => {
  it('sizes the backing store to the viewport and draws each tick', () => {
    const c = render(<FxWallpaper kind="starfield" />);
    const canvas = c.container.querySelector('canvas');
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(canvas.id).toBe('fx-wallpaper');
    expect(canvas.width).toBe(window.innerWidth); // dpr 1 in happy-dom
    expect(ctx2d.calls.some(([n, ...a]) => n === 'setTransform' && a[0] === 1)).toBe(true);
    expect(rafCalls).toHaveLength(1);
    act(() => { rafCb()(1000); });
    expect(ctx2d.calls.some(([n, ...a]) => n === 'fillRect' && a[2] === window.innerWidth)).toBe(true);
    expect(ctx2d.calls.some(([n]) => n === 'arc')).toBe(true); // stars drawn
  });

  it('redraws on resize with the new viewport', () => {
    const c = render(<FxWallpaper kind="mesh" />);
    const before = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect(c.container.querySelector('canvas').width).toBe(800);
    Object.defineProperty(window, 'innerWidth', { value: before, configurable: true });
  });

  it('prefers-reduced-motion draws one static frame and never loops', () => {
    const mm = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true });
    render(<FxWallpaper kind="aurora" />);
    expect(rafCalls).toHaveLength(0); // no loop armed
    const fills = ctx2d.calls.filter(([n]) => n === 'fillRect');
    expect(fills).toHaveLength(1); // background, then a single static draw
    expect(ctx2d.calls.some(([n]) => n === 'stroke')).toBe(true);
    mm.mockRestore();
  });

  it('motion="gentle" (the saver) keeps the loop alive under reduced motion', () => {
    // Regression: reduced motion froze the saver at frame zero — the whole
    // preview read as a static image. Savers slow to 0.35×, never freeze.
    const mm = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true });
    const c = render(<FxWallpaper kind="starfield" motion="gentle" />);
    expect(rafCalls).toHaveLength(1); // loop armed despite the preference
    const before = ctx2d.calls.filter(([n]) => n === 'arc').length;
    act(() => { rafCb()(1000); });
    expect(ctx2d.calls.filter(([n]) => n === 'arc').length).toBeGreaterThan(before);
    c.unmount();
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    mm.mockRestore();
  });

  it('pausing on a hidden tab cancels the loop and resuming restarts it', () => {
    const c = render(<FxWallpaper kind="waves" />);
    expect(rafCalls).toHaveLength(1);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(rafCalls).toHaveLength(1); // nothing re-armed while hidden
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(rafCalls).toHaveLength(2); // a fresh frame callback is armed
    c.unmount();
    // hidden-stop + visible-restop + unmount teardown each cancel
    expect(cancelSpy).toHaveBeenCalledTimes(3);
  });

  it('the id prop flows through (the saver mounts its own canvas)', () => {
    const c = render(<FxWallpaper kind="matrix" id="saver-fx" />);
    expect(c.container.querySelector('#saver-fx')).toBeTruthy();
  });
});
