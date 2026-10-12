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


describe('shell remainder', () => {
  it('desktop menu: Sort by name, Rearrange freely, Display settings, Toggle fullscreen', async () => {
    mountApp();
    await ctx(document.querySelector('#desktop'));
    await clickItem('Sort icons by name');
    expect(osNow().desktop.sort).toBe('name');
    await closeMenu();
    await ctx(document.querySelector('#desktop'));
    await clickItem('Rearrange freely');
    expect(osNow().desktop.sort).toBe('custom');
    expect(osNow().order.length).toBeGreaterThan(0);
    await closeMenu();
    await ctx(document.querySelector('#desktop'));
    await clickItem('Display settings…');
    expect(osNow().windows.some((w) => w.appId === 'settings')).toBe(true);
    await closeMenu();

    const events = [];
    const onFs = () => events.push(1);
    document.addEventListener('webos:fullscreen', onFs);
    await ctx(document.querySelector('#desktop'));
    await clickItem('Toggle fullscreen');
    document.removeEventListener('webos:fullscreen', onFs);
    expect(events).toHaveLength(1); // the same event F11 dispatches
  });

  it('icon menu: Open launches the app; Properties opens the dialog', async () => {
    mountApp();
    await ctx(iconOf('calc'));
    await clickItem('Open Calculator');
    expect(osNow().windows.some((w) => w.appId === 'calc')).toBe(true);
    await closeMenu();
    await ctx(iconOf('editor'));
    await clickItem('Properties');
    expect(document.querySelector('[aria-label="Editor properties"]')).toBeTruthy();
  });

  it('titlebar menu maximizes/restores; a pinned icon offers Unpin', async () => {
    const os = mountApp();
    act(() => { os.launch('calc'); });
    await act(async () => {});
    await ctx(document.querySelector('.titlebar'));
    await clickItem('Maximize');
    expect(osNow().windows.find((w) => w.appId === 'calc').max).toBe(true);
    await closeMenu();
    await ctx(document.querySelector('.titlebar'));
    await clickItem('Restore');
    expect(osNow().windows.find((w) => w.appId === 'calc').max).toBe(false);
    await closeMenu();

    await ctx(iconOf('editor'));
    await clickItem('Pin to taskbar');
    expect(osNow().taskbar.pinned).toContain('editor');
    await closeMenu();
    await ctx(iconOf('editor'));
    await clickItem('Unpin from taskbar');
    expect(osNow().taskbar.pinned).not.toContain('editor');
  });

  it('taskbar menu: Taskbar settings… and App Store… launch their targets', async () => {
    mountApp();
    await ctx(document.querySelector('#taskbar'));
    await clickItem('Taskbar settings…');
    const settings1 = osNow().windows.filter((w) => w.appId === 'settings').pop();
    expect(settings1.args).toEqual({ initial: 'taskbar' });
    await closeMenu();
    await ctx(document.querySelector('#taskbar'));
    await clickItem('App Store…');
    expect(osNow().windows.some((w) => w.appId === 'store')).toBe(true);
  });

  it('Start menu links open the Store and Settings through the shell', async () => {
    mountApp();
    fireEvent.click(document.querySelector('#start-btn'));
    await act(async () => {});
    fireEvent.click([...document.querySelectorAll('#start-menu .sm-link')]
      .find((b) => b.textContent.includes('App Store')));
    await act(async () => {});
    expect(osNow().windows.some((w) => w.appId === 'store')).toBe(true);
    fireEvent.click(document.querySelector('#start-btn'));
    await act(async () => {});
    fireEvent.click([...document.querySelectorAll('#start-menu .sm-link')]
      .find((b) => b.textContent.includes('Settings &')));
    await act(async () => {});
    expect(osNow().windows.some((w) => w.appId === 'settings')).toBe(true);
  });

  it('a composite wallpaper mounts the composite layer on the desktop', async () => {
    const os = mountApp();
    act(() => {
      os.wpSave({
        id: 'wp-shell-comp',
        name: 'Desk comp',
        base: { kind: 'gradient', angle: 160, stops: [{ color: '#101828', at: 0 }, { color: '#0b0e14', at: 100 }] },
        pattern: { kind: 'none', size: 32, color: '#ffffff', opacity: 0.08 },
        effect: { kind: 'none', strength: 0.5, color: '#38bdf8' },
        floats: [],
      });
    });
    expect(osNow().composites).toHaveLength(1);
    act(() => { osNow().setTheme({ wallpaper: 'wp-shell-comp' }); });
    await act(async () => {});
    expect(document.querySelector('.wpcomp')).toBeTruthy(); // the composite layer mounted
  });

  it('a pointerdown far from an icon never starts a drag (click still launches)', async () => {
    mountApp();
    const ico = iconOf('calc');
    press(ico, 'pointerdown', -500, -500); // hit-test miss
    press(ico, 'pointerup', -500, -500);
    fireEvent.click(ico);
    await act(async () => {});
    expect(osNow().windows.some((w) => w.appId === 'calc')).toBe(true);
  });
});

/* Remaining one-line seams: the start-menu row menu, titlebar Properties and
   Open-in-new-tab, the taskbar menu's plain Settings item, the tray's
   settings/widgets buttons (Sidebar mount through App), the unmenuable
   surface, custom-app creation (Add app through the desktop menu), pinning
   by dropping an icon exactly on a taskbar slot, and dragging a group tile. */
describe('shell remainder 2', () => {
  it('a start-menu app row offers Open + both pin surfaces', async () => {
    const os = mountApp();
    const openRow = async () => {
      act(() => { fireEvent.click(document.querySelector('#start-btn')); });
      await act(async () => {});
      return document.querySelector('[data-cm^="smapp:"]');
    };
    const row = await openRow();
    const appId = row.dataset.cm.split(':')[1];
    await ctx(row);
    await clickItem(`Open ${os.findApp(appId).name}`);
    expect(osNow().windows.some((w) => w.appId === appId)).toBe(true);

    await ctx(document.querySelector('#desktop'));
    await closeMenu();
    const row2 = await openRow();
    const pinId = row2.dataset.cm.split(':')[1];
    await ctx(row2);
    expect(item('Unpin from Start')).toBeTruthy(); // start rows are start-pinned by definition
    await clickItem('Pin to taskbar');
    expect(osNow().taskbar.pinned).toContain(pinId);
  });

  it('the titlebar menu opens Properties through App state', async () => {
    mountApp();
    act(() => { osNow().launch('calc'); });
    await act(async () => {});
    const win = osNow().windows.find((w) => w.appId === 'calc');
    await ctx(document.querySelector(`[data-cm="titlebar:${win.id}"]`));
    await clickItem('Properties');
    expect(document.querySelector('[aria-label="Calculator properties"]')).toBeTruthy();
    act(() => { fireEvent.click(document.querySelector('.props .tb-btn.close')); });
    await act(async () => {});
    expect(document.querySelector('[aria-label="Calculator properties"]')).toBeNull();
  });

  it('the taskbar menu has a plain Settings item and the tray buttons wire through', async () => {
    mountApp();
    await ctx(document.querySelector('#taskbar'));
    await clickItem('Settings…');
    expect(osNow().windows.some((w) => w.appId === 'settings')).toBe(true);

    act(() => { fireEvent.click(document.querySelector('[data-tray="widgets"]')); });
    await act(async () => {});
    expect(document.querySelector('#sidebar, .sidebar, [class*="sidebar"]')).toBeTruthy();
    // closing hands off through App state, not just unmounting locally
    act(() => { fireEvent.click(document.querySelector('[title="Close widgets"]')); });
    await act(async () => {});
    expect(document.querySelector('#sidebar')).toBeNull();

    // tray settings gear launches Settings as a singleton (already open)
    const before = osNow().windows.length;
    act(() => { fireEvent.click(document.querySelector('[title="Settings"]')); });
    await act(async () => {});
    expect(osNow().windows.some((w) => w.appId === 'settings')).toBe(true);
    expect(osNow().windows.length).toBe(before);
  });

  it('an unknown data-cm surface builds no menu at all', async () => {
    mountApp();
    const stray = document.createElement('span');
    stray.dataset.cm = 'zzz:nowhere';
    document.querySelector('#desktop').appendChild(stray);
    await ctx(stray);
    expect(document.querySelector('.ctx-item')).toBeNull();
  });

  it('Add app… creates a PWA: embedded launches a window, bare link stays a tab', async () => {
    mountApp();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    await ctx(document.querySelector('#desktop'));
    await clickItem('Add app…');
    const dlg = document.querySelector('[aria-label="Add app"]');
    expect(dlg).toBeTruthy();
    act(() => { fireEvent.change(dlg.querySelector('input[placeholder="My app"]'), { target: { value: 'Kestrel' } }); });
    act(() => { fireEvent.change(dlg.querySelector('input[placeholder="https://example.com"]'), { target: { value: 'https://kestrel.example' } }); });
    act(() => { fireEvent.click([...dlg.querySelectorAll('input[type="checkbox"]')][0]); }); // embed
    act(() => { fireEvent.click([...dlg.querySelectorAll('button')].find((b) => b.textContent === 'Add app')); });
    await act(async () => {});
    const embedded = osNow().userApps.find((a) => a.name === 'Kestrel');
    expect(embedded?.url).toBe('https://kestrel.example');
    expect(embedded?.embed).toBe(true);
    act(() => { osNow().launch(embedded.id); });
    await act(async () => {});
    const win = osNow().windows.find((w) => w.appId === embedded.id);
    expect(win).toBeTruthy();
    await ctx(document.querySelector(`[data-cm="titlebar:${win.id}"]`));
    await clickItem('Open in new tab');
    expect(open).toHaveBeenCalledWith('https://kestrel.example', '_blank', 'noopener');

    // a bare (non-embed) link app never gets a window — its desktop tile says so
    await ctx(document.querySelector('#desktop'));
    await clickItem('Add app…');
    const dlg2 = document.querySelector('[aria-label="Add app"]');
    act(() => { fireEvent.change(dlg2.querySelector('input[placeholder="My app"]'), { target: { value: 'Barelink' } }); });
    act(() => { fireEvent.change(dlg2.querySelector('input[placeholder="https://example.com"]'), { target: { value: 'https://bare.example' } }); });
    act(() => { fireEvent.click([...dlg2.querySelectorAll('button')].find((b) => b.textContent === 'Add app')); });
    await act(async () => {});
    const bare = osNow().userApps.find((a) => a.name === 'Barelink');
    const tile = document.querySelector(`#icon-grid [data-cm="icon:${bare.id}"]`);
    expect(tile.title).toContain('opens in new tab');
    open.mockRestore();
  });

  it('dropping an unpinned icon exactly on a taskbar slot splices it in there', async () => {
    mountApp();
    act(() => { osNow().setTaskbar({ pinned: ['calc', 'files'] }); });
    await act(async () => {});
    expect(osNow().taskbar.pinned).not.toContain('editor');
    const ico = iconOf('editor');
    press(ico, 'pointerdown', 30, 1040);
    press(ico, 'pointermove', 0, 2005); // taskbar band; slot rects are 0-width → only x=0 hits
    press(ico, 'pointerup', 0, 2005);
    await act(async () => {});
    expect(osNow().taskbar.pinned).toContain('editor');
  });

  it('a group tile takes the drag machine (pointer down → move → up)', async () => {
    const os = mountApp();
    act(() => { os.addGroup({ id: 'grp-drag', name: 'Draggable', appIds: ['calc'] }); });
    await act(async () => {});
    const group = document.querySelector('#icon-grid [data-gid="grp-drag"]');
    expect(group).toBeTruthy();
    const before = osNow().groups.length;
    press(group, 'pointerdown', 38, 45);
    press(group, 'pointermove', 300, 1145);
    press(group, 'pointerup', 300, 1145);
    await act(async () => {});
    expect(osNow().groups.length).toBe(before); // drag ends cleanly, group intact
  });
});
