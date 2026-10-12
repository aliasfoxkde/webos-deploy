// App shell, part 2: the surfaces part 1 doesn't reach — every context-menu
// branch (icon variants incl. custom/store/system apps, running-window taskbar
// menus, tray, clock, titlebar new-tab), the desktop icon drag machine
// (reorder, file-into-group, pin-by-drop, click swallowing, guards), virtual
// window chrome, GroupPopup wiring, power paths, the remaining tiling
// branches, the mobile drawer and the fx-wallpaper mount. Same harness as
// app-shell.test.jsx — the real <App/> over the real OS store.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, fireEvent, cleanup } from '@testing-library/react';
import App from '../src/App.jsx';
import { OSProvider } from '../src/os/state.jsx';

// Layout pins: getBoundingClientRect is zero everywhere in happy-dom, but the
// drag machine hit-tests icon/taskbar rects. Give every desk icon a stable
// box (stacked at y=1000+, one group tile at the top) and the taskbar a band
// at y=2000.
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

const ctx2d = () => new Proxy({}, {
  get(_, prop) { return prop === 'canvas' ? undefined : () => {}; },
  set() { return true; },
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mt() { return rectOf(this); });
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: (type) => (type === '2d' ? ctx2d() : null), configurable: true, writable: true,
  });
  Reflect.defineProperty(document.documentElement, 'requestFullscreen', { value: async () => {}, configurable: true, writable: true });
  Reflect.defineProperty(document, 'exitFullscreen', { value: async () => {}, configurable: true, writable: true });
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  Reflect.deleteProperty(document, 'exitFullscreen');
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'getContext');
  cleanup();
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

describe('icon menu variants', () => {
  it('a custom app offers Edit + Remove; Remove drops it', async () => {
    const os = mountApp();
    act(() => { os.addUserApp({ id: 'mytool', name: 'MyTool', url: 'https://example.com/tool', tagline: 'x', icon: 'icons/globe.svg' }); });
    await ctx(iconOf('mytool'));
    expect(item('Edit app…')).toBeTruthy();
    await clickItem('Remove');
    expect(osNow().apps.some((a) => a.id === 'mytool')).toBe(false);
  });

  it('a store (non-default) app offers Uninstall; a system app is disabled', async () => {
    const os = mountApp();
    act(() => { os.install('g2048'); });
    await ctx(iconOf('g2048'));
    expect(item('Uninstall')).toBeTruthy();
    await closeMenu();
    await ctx(iconOf('calc'));
    expect(item('(system app)').disabled).toBe(true);
  });

  it('“Open in new tab” hands the url to window.open; Open launches', async () => {
    const os = mountApp();
    act(() => { os.install('g2048'); });
    await ctx(iconOf('g2048'));
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    await clickItem('Open in new tab');
    vi.unstubAllGlobals();
    expect(openSpy).toHaveBeenCalledWith('https://gabrielecirulli.github.io/2048/', '_blank', 'noopener');
    expect(osNow().windows.some((w) => w.appId === 'g2048')).toBe(false); // menu, not launch
    await ctx(iconOf('g2048'));
    await clickItem('Open 2048');
    expect(osNow().windows.some((w) => w.appId === 'g2048')).toBe(true);
  });
});

describe('taskbar-button menus', () => {
  it('not running → Open; one window → Show; minimized → Restore', async () => {
    const os = mountApp();
    act(() => { os.setTaskbar({ pinned: ['calc'] }); });
    const btn = () => document.querySelector('[data-cm="app:calc"]');
    await ctx(btn());
    expect(item('Open Calculator')).toBeTruthy();
    await clickItem('Open Calculator');
    const cur = osNow();
    expect(cur.windows).toHaveLength(1);
    await ctx(btn());
    expect(item('Show window')).toBeTruthy();
    await closeMenu();
    act(() => { cur.minimize(cur.windows[0].id); });
    await ctx(btn());
    expect(item('Restore window').textContent).toContain('minimized');
    await clickItem('Restore window');
    expect(osNow().windows[0].min).toBe(false);
  });

  it('two windows → per-window items, New window, Close all', async () => {
    const os = mountApp();
    act(() => { os.launch('photos'); os.launch('photos'); });
    await ctx(document.querySelector('[data-cm="app:photos"]'));
    expect(item('Window 1')).toBeTruthy();
    expect(item('Window 2')).toBeTruthy();
    expect(item('New window')).toBeTruthy();
    await clickItem('Close all 2 windows');
    expect(osNow().windows.filter((w) => w.appId === 'photos')).toHaveLength(0);
  });

  it('pin/unpin from the taskbar-button menu (labels follow pin state)', async () => {
    const os = mountApp();
    // photos is running but not pinned → the menu offers Pin
    act(() => { os.launch('photos'); });
    await ctx(document.querySelector('[data-cm="app:photos"]'));
    await clickItem('Pin to taskbar');
    expect(osNow().taskbar.pinned).toContain('photos');
    // now pinned → the same button's menu offers Unpin (button stays: running)
    await ctx(document.querySelector('[data-cm="app:photos"]'));
    await clickItem('Unpin from taskbar');
    expect(osNow().taskbar.pinned).not.toContain('photos');
  });
});

describe('tray + clock menus', () => {
  it('tray: fullscreen event, widgets sidebar, settings launch', async () => {
    mountApp();
    const seen = vi.fn();
    document.addEventListener('webos:fullscreen', seen);
    await ctx(document.querySelector('[data-cm="tray"]'));
    await clickItem('Toggle fullscreen');
    expect(seen).toHaveBeenCalledTimes(1);
    await ctx(document.querySelector('[data-cm="tray"]'));
    await clickItem('Widgets');
    expect(document.querySelector('#sidebar')).toBeTruthy();
    await ctx(document.querySelector('[data-cm="tray"]'));
    await clickItem('Settings…');
    expect(osNow().windows.some((w) => w.appId === 'settings')).toBe(true);
    document.removeEventListener('webos:fullscreen', seen);
  });

  it('clock: Open calendar clicks the clock (opens the calendar panel)', async () => {
    mountApp();
    const spy = vi.fn();
    document.querySelector('#clock').addEventListener('click', spy);
    await ctx(document.querySelector('#clock'));
    await clickItem('Open calendar');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('group menu + popup wiring', () => {
  const makeGroup = (os) => act(() => {
    os.addGroup({ id: 'grp-tools', name: 'Tools', appIds: ['calc', 'editor'] });
  });

  it('the group menu opens the popup; a member row launches and closes', async () => {
    const os = mountApp();
    makeGroup(os);
    await ctx(document.querySelector('[data-cm="group:grp-tools"]'));
    await clickItem('Open Tools');
    expect(document.querySelector('.gp').getAttribute('aria-label')).toBe('Tools');
    act(() => { fireEvent.click(document.querySelector('.gp-app')); });
    expect(osNow().windows.some((w) => w.appId === 'calc')).toBe(true);
    expect(document.querySelector('.gp')).toBeNull();
  });

  it('popup: rename on blur, member removal, Escape, Remove group', async () => {
    const os = mountApp();
    makeGroup(os);
    await ctx(document.querySelector('[data-cm="group:grp-tools"]'));
    await clickItem('Open Tools');
    const nameInput = document.querySelector('.gp-name');
    act(() => { fireEvent.change(nameInput, { target: { value: 'Toolbox' } }); });
    act(() => { fireEvent.blur(nameInput); });
    expect(osNow().groups[0].name).toBe('Toolbox');
    act(() => { fireEvent.click(document.querySelector('.gp-rm[title^="Remove Editor"]')); });
    expect(osNow().groups[0].appIds).toEqual(['calc']);
    act(() => { fireEvent.click(document.querySelector('.gp-rm[title^="Remove Calculator"]')); });
    expect(document.querySelector('.gp-empty').textContent).toContain('Empty group');
    act(() => { fireEvent.keyDown(document.querySelector('.gp-name'), { key: 'Escape' }); });
    expect(document.querySelector('.gp')).toBeNull();
    await ctx(document.querySelector('[data-cm="group:grp-tools"]'));
    await clickItem('Remove group');
    expect(osNow().groups).toHaveLength(0);
  });
});

describe('icon drag machine', () => {
  const setup = () => {
    const os = mountApp();
    act(() => { os.setDesktop({ sort: 'custom' }); });
    return os;
  };
  const drag = (fromEl, x1, y1, x2, y2) => {
    press(fromEl, 'pointerdown', x1, y1);
    press(window, 'pointermove', x1 + 2, y1); // below the 6px threshold
    press(window, 'pointermove', x2, y2);
    press(window, 'pointerup', x2, y2);
  };

  it('reorder: dragging an icon onto another updates the saved order', () => {
    setup();
    act(() => { osNow().setOrder(['calc', 'editor', 'files']); });
    drag(iconOf('editor'), 10, 1150, 10, 1005); // slot 1 onto slot 0's box
    expect(osNow().order[0]).toBe('editor');
    expect(JSON.parse(localStorage.getItem('webos.desktop.order'))[0]).toBe('editor');
  });

  it('file-into-group: dropping an app on a group tile adds it to the group', () => {
    const os = setup();
    act(() => { os.addGroup({ id: 'grp-x', name: 'X', appIds: [] }); });
    drag(iconOf('calc'), 10, 1150, 10, 20); // onto the group tile at the top
    expect(osNow().groups.find((g) => g.id === 'grp-x').appIds).toContain('calc');
  });

  it('pin-by-drop: dropping on the taskbar pins without reordering', () => {
    setup();
    drag(iconOf('calc'), 10, 1150, 300, 2010); // down into the taskbar band
    expect(osNow().taskbar.pinned).toContain('calc');
    expect(osNow().windows).toHaveLength(0); // no launch, no reorder
  });

  it('the click after a real drag is swallowed (no accidental launch)', () => {
    setup();
    drag(iconOf('calc'), 10, 1150, 50, 1180); // moves, lands back on itself
    act(() => { fireEvent.click(iconOf('calc')); });
    expect(osNow().windows).toHaveLength(0);
  });

  it('guards: sub-threshold drags stay clickable; no crash on sorted desktops', () => {
    setup();
    drag(iconOf('editor'), 10, 1160, 11, 1161); // below threshold → plain click
    act(() => { fireEvent.click(iconOf('editor')); });
    expect(osNow().windows.some((w) => w.appId === 'editor')).toBe(true);
    act(() => { osNow().setDesktop({ sort: 'name' }); });
    const before = osNow().order.join();
    drag(iconOf('editor'), 10, 1160, 10, 1005);
    expect(osNow().order.join()).toBe(before); // name-sorted desktop never reorders
  });
});

describe('virtual windows (store/settings)', () => {
  it('chrome buttons minimize/maximize/close; double-click toggles max', async () => {
    const os = mountApp();
    act(() => { os.launch('store'); });
    const win = document.querySelector('section[aria-label="App Store"]');
    expect(win).toBeTruthy();
    const btn = (t) => win.querySelector(`.tb-btn[title="${t}"]`);
    act(() => { fireEvent.click(btn('Minimize')); });
    expect(osNow().windows[0].min).toBe(true);
    act(() => { fireEvent.click(btn('Maximize')); });
    expect(osNow().windows[0].max).toBe(true);
    act(() => { fireEvent.dblClick(win.querySelector('.titlebar')); });
    expect(osNow().windows[0].max).toBe(false); // double-click untoggles
    act(() => { fireEvent.click(btn('Close')); });
    expect(osNow().windows).toHaveLength(0);
  });

  it('pressing the titlebar focuses the window (buttons excluded)', () => {
    const os = mountApp();
    act(() => { os.launch('store'); os.launch('settings'); });
    act(() => { osNow().focus(osNow().windows[1].id); });
    press(document.querySelector('section[aria-label="App Store"] .titlebar'), 'pointerdown', 40, 8);
    expect(osNow().focused).toBe(osNow().windows[0].id);
  });
});

describe('power paths', () => {
  it(`Restart reloads; the halt overlay's Power on reloads too`, async () => {
    mountApp();
    const reload = vi.fn();
    Reflect.defineProperty(window.location, 'reload', { value: reload, configurable: true });
    act(() => { fireEvent.click(document.querySelector('#start-btn')); });
    act(() => { fireEvent.click(document.querySelector('.sm-pwr[title^="Restart"]')); });
    expect(reload).toHaveBeenCalledTimes(1);
    act(() => { fireEvent.click(document.querySelector('#start-btn')); });
    act(() => { fireEvent.click(document.querySelector('.sm-pwr[title^="Shut down"]')); });
    const halt = document.querySelector('#halt');
    expect(halt.getAttribute('aria-label')).toBe('System shut down');
    act(() => { fireEvent.click(halt.querySelector('button.accent')); });
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe('tiling branches', () => {
  const key = (k, mods) => act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...mods }));
  });

  it('Down restores a maximized window, untiles a snapped one, skips minimized', () => {
    const os = mountApp();
    act(() => { os.launch('calc'); });
    const id = osNow().focused;
    act(() => { osNow().toggleMax(id); });
    key('ArrowDown', { metaKey: true });
    expect(osNow().windows[0].max).toBe(false);
    act(() => { osNow().snap(id, 'left'); });
    key('ArrowDown', { metaKey: true });
    expect(osNow().windows[0].snap).toBeFalsy();
    act(() => { osNow().minimize(id); });
    key('ArrowDown', { metaKey: true });
    expect(osNow().windows[0].min).toBe(true); // early return, no state churn
  });

  it('Ctrl+Alt is an accepted modifier too', () => {
    const os = mountApp();
    act(() => { os.launch('calc'); });
    key('ArrowRight', { ctrlKey: true, altKey: true });
    expect(osNow().windows[0].snap).toBe('right');
  });
});

describe('mobile drawer', () => {
  it('mobile mode shows the home FAB; it opens the drawer; closing hides it', () => {
    const os = mountApp();
    act(() => { os.setUiMode('mobile'); });
    expect(document.querySelector('#home-fab')).toBeTruthy();
    act(() => { fireEvent.click(document.querySelector('#home-fab')); });
    const drawer = document.querySelector('#drawer');
    expect(drawer.getAttribute('aria-label')).toBe('All apps');
    expect(document.querySelector('#home-fab')).toBeNull(); // FAB yields to the drawer
    act(() => { fireEvent.click(drawer.querySelector('button[title="Close"], .drawer-head button')); });
    expect(document.querySelector('#drawer')).toBeNull();
    act(() => { os.setUiMode('desktop'); });
  });
});

describe('fx wallpaper mount', () => {
  it('an fx:* wallpaper renders the fx canvas layer', () => {
    const os = mountApp();
    act(() => { os.setTheme({ wallpaper: 'fx:starfield' }); });
    const fx = [...document.body.querySelectorAll('canvas')].length;
    expect(fx).toBeGreaterThan(0);
  });
});
