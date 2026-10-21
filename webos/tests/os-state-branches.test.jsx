// Branch-coverage additions for src/os/state.jsx (the OS reducer + provider)
// and src/App.jsx (the shell wiring). Every test here drives the PUBLIC
// surface — the OSProvider/useOS api and the real <App/> — and asserts
// observable behaviour; nothing under src/ is touched.
//
// The uncovered branches these close are the "second path" of each guard:
// the else of a reducer ternary, the early return of a missing window id,
// the falsy fallbacks of the persisted slices, the unmatched context-menu
// surface, and the drag machine's forward/no-op moves.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, fireEvent, cleanup } from '@testing-library/react';
import App from '../src/App.jsx';
import { OSProvider, useOS } from '../src/os/state.jsx';

/* ------------------------------------------------------------------ *
 * state.jsx — driven through the provider, like os-state.test.jsx
 * ------------------------------------------------------------------ */

let cur;
const Probe = () => {
  // test probe: capture the live OS context outside React's knowledge —
  // assertions read `cur` after act(), never during render
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};
const mount = () => render(<OSProvider><Probe /></OSProvider>);
const act6 = (fn) => act(() => {
  fn(cur);
  return undefined;
});

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.className = '';
  document.body.style.cssText = '';
  document.documentElement.style.cssText = '';
  delete document.body.dataset.persona;
  // DOM doubles for the shell: stable boxes for the drag hit-tests and a
  // recording 2d context for the FX wallpapers (no WebGL in happy-dom).
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function mt() { return rectOf(this); });
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: (type) => (type === '2d' ? makeCtx() : null), configurable: true, writable: true,
  });
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    value: () => 'data:image/png;base64,', configurable: true, writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'getContext');
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'toDataURL');
  cleanup();
});

describe('state.jsx — reducer guards and fallbacks', () => {
  it('uninstall leaves a group that does not hold the app untouched', () => {
    localStorage.setItem('webos.groups', JSON.stringify([{ id: 'g1', name: 'G', appIds: ['terminal'] }]));
    mount();
    act6((o) => o.install('globe'));
    act6((o) => o.uninstall('globe'));
    expect(cur.installed).toEqual([]);
    expect(cur.groups).toEqual([{ id: 'g1', name: 'G', appIds: ['terminal'] }]);
  });

  it('uninstall survives a taskbar whose pin lists are missing', () => {
    localStorage.setItem('webos.taskbar', JSON.stringify({ position: 'top', pinned: null, startPins: null }));
    mount();
    act6((o) => o.install('globe'));
    act6((o) => o.uninstall('globe'));
    expect(cur.taskbar.pinned).toEqual([]);
    expect(cur.taskbar.startPins).toEqual([]);
    expect(cur.taskbar.position).toBe('top');
  });

  it('a window id that does not exist is a no-op for toggleMax/setRect/snap/restore', () => {
    mount();
    act6((o) => o.launch('terminal'));
    const before = cur;
    act6((o) => o.toggleMax(9999));
    expect(cur).toBe(before);
    act6((o) => o.setRect(9999, { x: 1, y: 2, w: 3, h: 4 }));
    expect(cur).toBe(before);
    act6((o) => o.snap(9999, 'left'));
    expect(cur).toBe(before);
    act6((o) => o.restore(9999));
    expect(cur).toBe(before);
    expect(cur.windows.length).toBe(1);
  });

  it('toggleMax and setRect leave the sibling windows alone', () => {
    mount();
    act6((o) => o.launch('terminal'));
    act6((o) => o.launch('files'));
    const [a, b] = cur.windows;
    act6((o) => o.toggleMax(a.id));
    expect(cur.windows[0].max).toBe(true);
    expect(cur.windows[1]).toBe(b);
    act6((o) => o.setRect(a.id, { x: 7, y: 8, w: 300, h: 200 }));
    expect(cur.windows[0].rect).toEqual({ x: 7, y: 8, w: 300, h: 200 });
    expect(cur.windows[1]).toBe(b);
  });

  it('restoring a never-snapped window keeps its own rect and spares the others', () => {
    mount();
    act6((o) => o.launch('terminal'));
    act6((o) => o.launch('files'));
    const [a, b] = cur.windows;
    const rect = { ...a.rect };
    act6((o) => o.restore(a.id));
    expect(cur.windows[0].rect).toEqual(rect);
    expect(cur.windows[0].pre).toBeNull();
    expect(cur.windows[1]).toBe(b);
  });

  it('updating one user app leaves the other one alone', () => {
    mount();
    const one = { id: 'app-one', name: 'One' };
    const two = { id: 'app-two', name: 'Two' };
    act6((o) => o.addUserApp(one));
    act6((o) => o.addUserApp(two));
    act6((o) => o.updateUserApp({ ...one, name: 'One renamed' }));
    expect(cur.userApps.map((a) => a.name)).toEqual(['One renamed', 'Two']);
  });

  it('renaming and unfiling touch only the named group', () => {
    mount();
    act6((o) => o.addGroup({ id: 'g1', name: 'One', appIds: ['calc'] }));
    act6((o) => o.addGroup({ id: 'g2', name: 'Two', appIds: ['editor'] }));
    act6((o) => o.renameGroup('g1', 'Renamed'));
    expect(cur.groups.map((g) => g.name)).toEqual(['Renamed', 'Two']);
    act6((o) => o.groupRemove('g1', 'calc'));
    expect(cur.groups.map((g) => g.appIds)).toEqual([[], ['editor']]);
  });

  it('a malformed theme or composite record is rejected without touching the state', () => {
    mount();
    const before = cur;
    act6((o) => o.themeSave({ name: 'No id' }));
    expect(cur).toBe(before);
    expect(cur.userThemes).toEqual([]);
    act6((o) => o.wpSave({ name: 'No id' }));
    expect(cur).toBe(before);
    expect(cur.composites).toEqual([]);
  });

  it('removing an event from a date that has none yields an empty list', () => {
    mount();
    act6((o) => o.removeEvent('2026-01-02', 0));
    expect(cur.events['2026-01-02']).toEqual([]);
  });
});

describe('state.jsx — effect fallbacks', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a media query without a match value reads as "not coarse"', () => {
    const mql = { matches: undefined, addEventListener() {}, removeEventListener() {} };
    vi.stubGlobal('matchMedia', () => mql);
    mount();
    expect(cur.mobile).toBe(false);
    cleanup();
    vi.stubGlobal('matchMedia', () => ({ ...mql, matches: true }));
    mount();
    expect(cur.mobile).toBe(true); // a coarse pointer is a mobile OS
  });

  it('a nullish transparency falls back to the full-strength chrome', () => {
    mount();
    act6((o) => o.setUi({ transparency: null }));
    expect(document.documentElement.style.getPropertyValue('--chrome'))
      .toBe('rgba(16, 20, 30, 0.820)');
  });

  it('a zero scale falls back to the default font size', () => {
    mount();
    act6((o) => o.setUi({ scale: 0 }));
    expect(document.documentElement.style.fontSize).toBe('16px');
  });

  it('empty taskbar/desktop knobs fall back to their defaults', () => {
    mount();
    act6((o) => o.setTaskbar({ align: '', iconSize: '' }));
    act6((o) => o.setDesktop({ gap: '' }));
    expect(document.body.dataset.tbAlign).toBe('left');
    expect(document.body.dataset.tbIco).toBe('md');
    expect(document.body.dataset.deskGap).toBe('normal');
  });
});

/* ------------------------------------------------------------------ *
 * App.jsx — the shell, over the real OS store
 * ------------------------------------------------------------------ */

// Layout pins: happy-dom reports zero-sized rects, but the drag machine
// hit-tests icon/taskbar boxes. Give every desk icon a stable box (group
// tiles at the top, app icons below) and the taskbar a band at the bottom.
const rectOf = (el) => {
  if (el.closest?.('#taskbar')) return { left: 0, top: 2000, right: 800, bottom: 2040, width: 800, height: 40 };
  if (el.classList?.contains('desk-icon')) {
    const icons = [...document.querySelectorAll('#icon-grid .desk-icon')];
    const i = icons.indexOf(el);
    const y = (el.classList.contains('group-tile') ? 0 : 1000) + i * 100;
    return { left: 0, top: y, right: 76, bottom: y + 90, width: 76, height: 90 };
  }
  return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
};

// A recording 2d context — the FX wallpapers draw through it and the lens
// filter layer round-trips pixels through it. Every method is a no-op; the
// gradient factories hand back an object with addColorStop.
const makeCtx = () => new Proxy({}, {
  get(_, prop) {
    if (prop === 'canvas') return undefined;
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
      return () => ({ addColorStop: () => {} });
    }
    if (prop === 'measureText') return () => ({ width: 10 });
    if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    return () => {};
  },
  set() { return true; },
});

const mountApp = () => {
  localStorage.setItem('webos.welcomed', 'true');
  history.replaceState(null, '', '/');
  vi.stubGlobal('fetch', () => new Promise(() => {})); // iframes stay hermetic
  render(<OSProvider><App /></OSProvider>);
  return window.__os;
};
const ctx = async (el) => {
  fireEvent.contextMenu(el, { clientX: 12, clientY: 12 });
  await act(async () => {});
};
const item = (label) => [...document.querySelectorAll('.ctx-item')].find((b) => b.textContent.includes(label));
const clickItem = async (label) => {
  act(() => { fireEvent.click(item(label)); });
  await act(async () => {});
};
const closeMenu = async () => {
  act(() => { document.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
  await act(async () => {});
};
const press = (el, type, x, y) => act(() => {
  fireEvent(el, new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: x, clientY: y, button: 0 }));
});
const iconOf = (id) => document.querySelector(`#icon-grid [data-cm="icon:${id}"]`);
/* window.__os is reassigned on every state change — always read FRESH state */
const osNow = () => window.__os;
const stray = (cm) => {
  const el = document.createElement('span');
  el.dataset.cm = cm;
  document.querySelector('#desktop').appendChild(el);
  return el;
};

describe('App.jsx — virtual window chrome', () => {
  it('a titlebar button swallows the press: no drag, no move', () => {
    mountApp();
    act(() => { osNow().launch('store'); });
    const win = osNow().windows[0];
    const rect = { ...win.rect };
    const btn = document.querySelector('section[aria-label="App Store"] .tb-btn.max');
    press(btn, 'pointerdown', 20, 8);
    press(window, 'pointermove', 400, 300);
    press(window, 'pointerup', 400, 300);
    expect(osNow().windows[0].rect).toEqual(rect); // the drag never started
    expect(osNow().windows[0].max).toBe(false);    // …and the button did not act either
  });

  it('dragging a virtual window to an edge shows the snap preview', () => {
    mountApp();
    act(() => { osNow().launch('store'); });
    const titlebar = document.querySelector('section[aria-label="App Store"] .titlebar');
    press(titlebar, 'pointerdown', 200, 8);
    press(window, 'pointermove', 5, 300); // inside the left-edge capture band
    expect(document.querySelector('#snap-preview')).toBeTruthy();
    press(window, 'pointerup', 5, 300);
    expect(osNow().windows[0].snap).toBe('left');
  });
});

describe('App.jsx — group popup', () => {
  const openGroup = async (id) => {
    mountApp();
    act(() => { osNow().addGroup({ id, name: 'Tools', appIds: ['calc'] }); });
    act(() => { fireEvent.click(document.querySelector(`#icon-grid [data-gid="${id}"]`)); });
    await act(async () => {});
  };

  it('a group with an empty name opens the popup with an empty name field', async () => {
    mountApp();
    act(() => { osNow().addGroup({ id: 'grp-empty', name: '', appIds: [] }); });
    act(() => { fireEvent.click(document.querySelector('#icon-grid [data-gid="grp-empty"]')); });
    await act(async () => {});
    const input = document.querySelector('.gp-name');
    expect(input).toBeTruthy();
    expect(input.value).toBe('');
  });

  it('removing the group while its popup is open closes the popup', async () => {
    await openGroup('grp-vanish');
    expect(document.querySelector('.gp')).toBeTruthy();
    act(() => { osNow().removeGroup('grp-vanish'); });
    await act(async () => {});
    expect(document.querySelector('.gp')).toBeNull();
  });

  it('a key other than Escape leaves the popup open', async () => {
    await openGroup('grp-keys');
    act(() => { fireEvent.keyDown(document, { key: 'a' }); });
    expect(document.querySelector('.gp')).toBeTruthy();
  });

  it('Enter in the name field commits the rename and leaves the field', async () => {
    await openGroup('grp-enter');
    const input = document.querySelector('.gp-name');
    act(() => { fireEvent.change(input, { target: { value: 'Toolbox' } }); });
    input.focus();
    act(() => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(document.activeElement).not.toBe(input);
    expect(osNow().groups[0].name).toBe('Toolbox');
  });

  it('an emptied name keeps the group name it had', async () => {
    await openGroup('grp-keep');
    const input = document.querySelector('.gp-name');
    act(() => { fireEvent.change(input, { target: { value: '   ' } }); });
    act(() => { fireEvent.blur(input); });
    expect(osNow().groups[0].name).toBe('Tools');
  });
});

describe('App.jsx — context-menu surfaces', () => {
  it('an icon surface for an unknown app builds no menu', async () => {
    mountApp();
    await ctx(stray('icon:nope'));
    expect(document.querySelector('.ctx-menu')).toBeNull();
    await ctx(iconOf('calc'));
    expect(item('Open Calculator')).toBeTruthy(); // a real icon does open one
  });

  it('a group surface for an unknown group builds no menu', async () => {
    mountApp();
    await ctx(stray('group:nope'));
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });

  it('an app surface for an unknown app builds no menu', async () => {
    mountApp();
    await ctx(stray('app:nope'));
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });

  it('a start-menu surface for an unknown app builds no menu', async () => {
    mountApp();
    await ctx(stray('smapp:nope'));
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });

  it('a titlebar surface for an unknown window builds no menu', async () => {
    mountApp();
    await ctx(stray('titlebar:999'));
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });

  it('an icon menu works with no pin list at all', async () => {
    mountApp();
    act(() => { osNow().setTaskbar({ pinned: null }); });
    await ctx(iconOf('calc'));
    expect(item('Pin to taskbar')).toBeTruthy();
    await clickItem('Pin to taskbar');
    expect(osNow().taskbar.pinned).toEqual(['calc']);
  });

  it('a taskbar-button menu works with no pin list at all', async () => {
    mountApp();
    act(() => { osNow().setTaskbar({ pinned: null }); });
    act(() => { osNow().launch('calc'); });
    await act(async () => {});
    await ctx(document.querySelector('[data-cm="app:calc"]'));
    expect(item('Pin to taskbar')).toBeTruthy();
  });

  it('a pinned single-instance app offers a new tab but no second window', async () => {
    mountApp();
    act(() => { osNow().setTaskbar({ pinned: ['mail'] }); });
    await ctx(document.querySelector('[data-cm="app:mail"]'));
    expect(item('Open in new tab')).toBeTruthy();
    expect(item('New window')).toBeUndefined();
  });

  it('a start-menu row offers both pin surfaces', async () => {
    mountApp();
    act(() => { osNow().setTaskbar({ startPins: null, pinned: null }); });
    act(() => { fireEvent.click(document.querySelector('#start-btn')); });
    await act(async () => {});
    await ctx(document.querySelector('[data-cm="smapp:calc"]'));
    expect(item('Pin to Start')).toBeTruthy();
    expect(item('Pin to taskbar')).toBeTruthy();
    await clickItem('Pin to Start');
    expect(osNow().taskbar.startPins).toEqual(['calc']);
    await closeMenu();
  });

  it('a start-menu row for a taskbar-pinned app offers to unpin it', async () => {
    mountApp();
    act(() => { osNow().setTaskbar({ pinned: ['calc'] }); });
    act(() => { fireEvent.click(document.querySelector('#start-btn')); });
    await act(async () => {});
    await ctx(document.querySelector('[data-cm="smapp:calc"]'));
    expect(item('Unpin from taskbar')).toBeTruthy();
  });

  it('the taskbar menu reports "off" when no widget is enabled', async () => {
    mountApp();
    act(() => { osNow().setWidgets({ enabled: [] }); });
    await ctx(document.querySelector('#taskbar'));
    expect(item('Widgets').querySelector('small').textContent).toBe('off');
  });
});

describe('App.jsx — start menu dismissal', () => {
  it('a pointerdown on the Start button does not close the open menu', () => {
    mountApp();
    act(() => { fireEvent.click(document.querySelector('#start-btn')); });
    expect(document.querySelector('#start-menu')).toBeTruthy();
    act(() => { fireEvent.pointerDown(document.querySelector('#start-btn')); });
    expect(document.querySelector('#start-menu')).toBeTruthy();
  });

  it('a key other than Escape does not close the open menu', () => {
    mountApp();
    act(() => { fireEvent.click(document.querySelector('#start-btn')); });
    expect(document.querySelector('#start-menu')).toBeTruthy();
    act(() => { fireEvent.keyDown(document, { key: 'a' }); });
    expect(document.querySelector('#start-menu')).toBeTruthy();
  });
});

describe('App.jsx — focus follows the mouse', () => {
  it('hovering outside a window and hovering the focused window change nothing', () => {
    mountApp();
    act(() => { osNow().setUi({ focusHover: true }); });
    act(() => { osNow().launch('calc'); });
    const w = osNow().windows[0];
    // the window container is not a window: no focus change, no crash
    act(() => { fireEvent.pointerOver(document.getElementById('windows')); });
    expect(osNow().focused).toBe(w.id);
    // the focused window is already up: hovering it must not raise it again
    const z = osNow().windows[0].z;
    act(() => { fireEvent.pointerOver(document.querySelector(`.win[data-id="${w.id}"]`)); });
    expect(osNow().focused).toBe(w.id);
    expect(osNow().windows[0].z).toBe(z);
  });
});

describe('App.jsx — desktop icon drag machine', () => {
  const setup = () => {
    mountApp();
    act(() => { osNow().setOrder(['calc', 'editor', 'files']); });
  };
  const drag = (fromEl, x1, y1, x2, y2) => {
    press(fromEl, 'pointerdown', x1, y1);
    press(window, 'pointermove', x1 + 2, y1); // below the 6px threshold
    press(window, 'pointermove', x2, y2);
    press(window, 'pointerup', x2, y2);
  };

  it('dragging an icon forward past another one reorders it', () => {
    setup();
    drag(iconOf('calc'), 10, 1050, 10, 1210); // slot 0 onto slot 2's box
    expect(osNow().order.slice(0, 3)).toEqual(['editor', 'calc', 'files']);
  });

  it('dragging an icon onto its own slot changes nothing', () => {
    setup();
    const before = osNow().order.join();
    drag(iconOf('calc'), 10, 1050, 10, 1040);
    expect(osNow().order.join()).toBe(before);
  });

  it('dropping on the taskbar with no pin list pins the app', () => {
    setup();
    act(() => { osNow().setTaskbar({ pinned: null }); });
    drag(iconOf('calc'), 10, 1050, 300, 2010);
    expect(osNow().taskbar.pinned).toEqual(['calc']);
    expect(osNow().windows).toHaveLength(0); // dropping is not launching
  });

  it('dropping an already-pinned app on the taskbar leaves the pin list alone', () => {
    setup();
    act(() => { osNow().setTaskbar({ pinned: ['calc'] }); });
    drag(iconOf('calc'), 10, 1050, 300, 2010);
    expect(osNow().taskbar.pinned).toEqual(['calc']); // not duplicated
    expect(osNow().windows).toHaveLength(0);
  });

  it('the click after a group-tile drag is swallowed (no popup)', () => {
    setup();
    act(() => { osNow().addGroup({ id: 'grp-x', name: 'X', appIds: [] }); });
    const tile = document.querySelector('#icon-grid [data-gid="grp-x"]');
    drag(tile, 10, 20, 10, 30); // a real drag that moves
    act(() => { fireEvent.click(tile); });
    expect(document.querySelector('.gp')).toBeNull();
  });
});

describe('App.jsx — wallpaper layers', () => {
  it('a pack wallpaper renders the CSS wallpaper layer', () => {
    mountApp();
    act(() => { osNow().setTheme({ wallpaper: 'aurora' }); });
    const layer = document.querySelector('#wallpaper');
    expect(layer).toBeTruthy();
    expect(layer.style.filter).toBe('none'); // a pack preset paints the layer as-is
  });

  it('the water fx wallpaper mounts its canvas layer', () => {
    mountApp();
    act(() => { osNow().setTheme({ wallpaper: 'fx:water', fxSpeed: null }); });
    expect(document.querySelector('#water-fx')).toBeTruthy();
    expect(document.querySelector('#wallpaper')).toBeNull(); // fx owns the layer
  });

  it('an fx wallpaper with a nullish speed still renders its canvas layer', () => {
    mountApp();
    act(() => { osNow().setTheme({ wallpaper: 'fx:starfield', fxSpeed: null }); });
    expect(document.querySelector('#fx-wallpaper')).toBeTruthy();
  });

  it('a group holding an app that no longer exists renders an empty thumbnail', () => {
    mountApp();
    act(() => { osNow().addGroup({ id: 'grp-ghost', name: 'Ghost', appIds: ['ghostapp'] }); });
    const tile = document.querySelector('#icon-grid [data-gid="grp-ghost"]');
    expect(tile).toBeTruthy();
    expect(tile.querySelector('.g-thumb img')).toBeNull();
    expect(tile.querySelector('.ver').textContent).toBe('1 app');
  });
});

describe('App.jsx — editing a custom app', () => {
  it('Edit app… opens the dialog with the app prefilled', async () => {
    mountApp();
    act(() => {
      osNow().addUserApp({
        id: 'mytool', name: 'MyTool', url: 'https://example.com/tool',
        tagline: 'x', icon: 'icons/globe.svg', embed: true,
      });
    });
    await ctx(iconOf('mytool'));
    await clickItem('Edit app…');
    const dlg = document.querySelector('[aria-label="Edit app"]');
    expect(dlg).toBeTruthy();
    expect(dlg.querySelector('input[placeholder="My app"]').value).toBe('MyTool');
    expect(dlg.querySelector('input[placeholder="https://example.com"]').value).toBe('https://example.com/tool');
  });
});
