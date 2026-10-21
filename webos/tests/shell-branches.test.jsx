// Branch sweep for the three shell surfaces that still had uncovered
// branches: Settings → Appearance, Settings → Panels, and the Taskbar.
//
// Every test here drives a real user action (a click, a slider, a drag, a
// file pick, a browser event) and asserts what the user can observe — the
// rendered value, the persisted state, or the callback the browser made.
// The gaps closed here are the "defensive" arms of the source: the fallback
// values a *partial* stored preference produces (a theme saved by an older
// build, a browser without the Network Information API, a connection API
// that disappears mid-session), the guards that abort a no-op action, and
// the second click of a toggle that closes what the first click opened.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';
import Appearance from '../src/shell/settings/Appearance.jsx';
import Taskbar from '../src/shell/Taskbar.jsx';
import {
  DesktopPanel, TaskbarPanel, NetworkPanel, StoragePanel, AboutPanel,
} from '../src/shell/settings/Panels.jsx';
import { DEFAULTS } from '../src/os/waterfx.js';

/* The composite renderer is a test double here: the panel passes the draft
   spec to it, and the spec's *name* is the only place the "unnamed
   wallpaper" fallback is observable. The double renders that name so the
   assertion is on what the component was handed, not on internals. */
vi.mock('../src/shell/CompositeWallpaper.jsx', () => ({
  default: ({ spec, className }) => (
    <div className={className} data-wp-name={spec?.name ?? ''} />
  ),
}));

let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};
const mount = (ui) => render(<OSProvider><Probe />{ui}</OSProvider>);

const byLabel = (c, label) => c.container.querySelector(`[aria-label="${label}"]`);
const click = (el) => { act(() => { fireEvent.click(el); }); };
const change = (el, value) =>
  act(() => { fireEvent.change(el, { target: { value: String(value) } }); });
const radios = (c, group) =>
  [...c.container.querySelectorAll(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`)];
const section = (c, heading) =>
  [...c.container.querySelectorAll('section')].find((s) => s.querySelector('h3')?.textContent === heading);
/* a <dl> row value by its <dt> label */
const prop = (c, key) => {
  const dts = [...c.container.querySelectorAll('dt')];
  const i = dts.findIndex((dt) => dt.textContent === key);
  return c.container.querySelectorAll('dd')[i]?.textContent;
};
/* seed a persisted WebOS preference before the provider mounts */
const seed = (key, value) => localStorage.setItem(`webos.${key}`, JSON.stringify(value));
/* stub a browser global, returning a restore function */
const stub = (obj, key, value) => {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  Object.defineProperty(obj, key, { value, configurable: true, writable: true });
  return () => {
    if (desc) Object.defineProperty(obj, key, desc);
    else Reflect.deleteProperty(obj, key);
  };
};
const restoreFns = [];
const stubGlobal = (obj, key, value) => { restoreFns.push(stub(obj, key, value)); };

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  cur = null;
});

afterEach(() => {
  while (restoreFns.length) restoreFns.pop()();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Appearance — unnamed drafts fall back to a labelled default', () => {
  it('an emptied theme name saves as "Untitled theme" and previews as such', () => {
    const c = mount(<Appearance />);
    click(byLabel(c, 'New theme'));
    change(byLabel(c, 'Theme name'), '');
    // the live preview names the unnamed draft
    expect(c.container.querySelector('.th-title').textContent).toBe('Untitled theme');
    click([...c.container.querySelectorAll('.theme-builder .btn')]
      .find((b) => b.textContent === 'Create theme'));
    expect(cur.userThemes[0].name).toBe('Untitled theme');
  });

  it('an emptied composite name saves as "Untitled wallpaper" and previews as such', () => {
    const c = mount(<Appearance />);
    click(byLabel(c, 'New composite'));
    change(byLabel(c, 'Composite name'), '');
    expect(c.container.querySelector('.wpb-preview').getAttribute('data-wp-name')).toBe('Untitled wallpaper');
    click([...c.container.querySelectorAll('.theme-builder .btn')]
      .find((b) => b.textContent === 'Create composite'));
    expect(cur.composites[0].name).toBe('Untitled wallpaper');
  });
});

describe('Appearance — the wallpaper studio', () => {
  it('a stop added under 100% lands halfway between the two stops', () => {
    const c = mount(<Appearance />);
    click(byLabel(c, 'New composite'));
    change(byLabel(c, 'Stop 2 position'), 60); // last stop is no longer at the end
    click([...c.container.querySelectorAll('.theme-builder button')]
      .find((b) => b.textContent === 'Add stop'));
    const readouts = [...c.container.querySelectorAll('.wpb-stops .th-hex')].map((s) => s.textContent);
    expect(readouts).toEqual(['0%', '60%', '30%']);
    click([...c.container.querySelectorAll('.theme-builder .btn')]
      .find((b) => b.textContent === 'Create composite'));
    expect(cur.composites[0].base.stops.map((s) => s.at)).toEqual([0, 30, 60]); // stored sorted by position
  });

  it('editing one float leaves the others alone', async () => {
    const c = mount(<Appearance />);
    click(byLabel(c, 'New composite'));
    change(byLabel(c, 'Floating image URL'), 'https://example.com/one.png');
    click([...c.container.querySelectorAll('.wpb-floats button')].find((b) => b.textContent === 'Add URL'));
    await new Promise((r) => setTimeout(r, 5)); // let the float id clock tick over
    change(byLabel(c, 'Floating image URL'), 'https://example.com/two.png');
    click([...c.container.querySelectorAll('.wpb-floats button')].find((b) => b.textContent === 'Add URL'));
    change(byLabel(c, 'Float 1 horizontal position'), 10);
    click([...c.container.querySelectorAll('.theme-builder .btn')]
      .find((b) => b.textContent === 'Create composite'));
    const floats = cur.composites[0].floats;
    expect(floats).toHaveLength(2);
    expect(floats[0].x).toBe(10);
    expect(floats[1].x).toBe(72); // the untouched float keeps its default
  });

  it('an empty file selection changes nothing', () => {
    const c = mount(<Appearance />);
    const wallpaperFile = section(c, 'Wallpaper').querySelector('input[type="file"]');
    Reflect.defineProperty(wallpaperFile, 'files', { configurable: true, value: [] });
    fireEvent.change(wallpaperFile);
    expect(cur.theme.wallpaper).toBe(''); // no file → no upload

    click(byLabel(c, 'New composite'));
    const baseFile = c.container.querySelectorAll('.theme-builder input[type="file"]')[0];
    Reflect.defineProperty(baseFile, 'files', { configurable: true, value: [] });
    fireEvent.change(baseFile);
    expect(c.container.querySelector('.wpb-preview').getAttribute('data-wp-name')).toBe('My wallpaper');
  });
});

describe('Appearance — filters and legacy preferences', () => {
  it('a wallpaper category chip filters the list to that category', () => {
    const c = mount(<Appearance />);
    const cats = [...c.container.querySelectorAll('.store-cats')][1]; // wallpaper categories
    click([...cats.querySelectorAll('.chip')].find((b) => b.textContent === 'Photos'));
    const titles = [...section(c, 'Wallpaper').querySelectorAll('.preset')].map((b) => b.textContent);
    expect(titles).toContain('Dunes');
    expect(titles).not.toContain('Water FX');
  });

  it('a stored interface without a scale renders the default 100%', () => {
    seed('ui', { scale: null, transparency: null });
    const c = mount(<Appearance />);
    expect(cur.ui.scale).toBeNull();
    expect(byLabel(c, 'UI scale').value).toBe('1');
    expect(byLabel(c, 'UI scale').parentElement.querySelector('span.dim').textContent).toBe('100%');
    expect(byLabel(c, 'Transparency strength').value).toBe('1');
    expect(byLabel(c, 'Transparency strength').parentElement.querySelector('span.dim').textContent).toBe('100%');
  });

  it('an FX wallpaper without a stored speed shows 1×', () => {
    seed('theme', { wallpaper: 'fx:aurora', fxSpeed: null });
    const c = mount(<Appearance />);
    expect(cur.theme.fxSpeed).toBeNull();
    expect(byLabel(c, 'Wallpaper animation speed').value).toBe('1');
    expect(byLabel(c, 'Wallpaper animation speed').parentElement.querySelector('span.dim').textContent).toBe('1×');
  });

  it('the water rain rate falls back to the default when the stored patch omits it', () => {
    seed('theme', { wallpaper: 'fx:water', water: { water: { rain: true, rainRate: null } } });
    const c = mount(<Appearance />);
    expect(cur.theme.water.water.rainRate).toBeNull();
    expect(byLabel(c, 'Rain drops per second').value).toBe(String(DEFAULTS.water.rainRate));
    expect(byLabel(c, 'Rain drops per second').parentElement.querySelector('span.dim').textContent)
      .toBe(`${DEFAULTS.water.rainRate}/s`);
  });

  it('a custom wallpaper without stored adjustments renders the defaults', () => {
    seed('theme', {
      wallpaper: 'https://example.com/x.jpg',
      fit: null, pos: null, bright: null, blur: null, sat: null,
    });
    const c = mount(<Appearance />);
    const wp = section(c, 'Wallpaper');
    // placement falls back to Fill, focus to the centre
    const fitChips = [...wp.querySelectorAll('.seg-row .chip')];
    expect(fitChips.find((b) => b.textContent === 'Fill').className).toContain('on');
    expect(byLabel(c, 'focus center center').className).toContain('on');
    // and the adjustment sliders sit at their defaults
    expect(wp.querySelector('#wp-bright').value).toBe('1');
    expect(wp.querySelector('#wp-blur').value).toBe('0');
    expect(wp.querySelector('#wp-sat').value).toBe('1');
  });
});

describe('Panels — preferences missing from an older profile', () => {
  it('a desktop without a stored grid gap falls back to Normal', () => {
    seed('desktop', { gap: null });
    const c = mount(<DesktopPanel />);
    expect(cur.desktop.gap).toBeNull();
    const normal = radios(c, 'Desktop grid spacing').find((b) => b.textContent === 'Normal');
    expect(normal.getAttribute('aria-checked')).toBe('true');
    expect(normal.className).toContain('on');
  });

  it('a taskbar without a stored alignment or icon size falls back to Left/Medium', () => {
    seed('taskbar', { align: null, iconSize: null });
    const c = mount(<TaskbarPanel />);
    expect(cur.taskbar.align).toBeNull();
    expect(cur.taskbar.iconSize).toBeNull();
    const left = radios(c, 'Taskbar alignment').find((b) => b.textContent === 'Left');
    expect(left.getAttribute('aria-checked')).toBe('true');
    const medium = radios(c, 'Taskbar icon size').find((b) => b.textContent === 'Medium');
    expect(medium.getAttribute('aria-checked')).toBe('true');
  });

  it('the storage list reports an empty key as 0 B and a large key in kilobytes', () => {
    localStorage.setItem('webos.empty', '');
    localStorage.setItem('webos.big', 'x'.repeat(600)); // 1200 bytes
    const c = mount(<StoragePanel />);
    const row = (k) => [...c.container.querySelectorAll('.widget-row')]
      .find((r) => r.querySelector('code')?.textContent === k);
    expect(row('webos.empty').querySelector('.dim').textContent).toBe('0 B');
    expect(row('webos.big').querySelector('.dim').textContent).toBe('1.2 KB');
    // clearing one key rescans the rest — including the empty one
    click(row('webos.big').querySelector('button'));
    expect(localStorage.getItem('webos.big')).toBeNull();
    expect(row('webos.empty')).toBeTruthy();
  });

  it('the factory reset is abandoned when the confirmation is dismissed', () => {

    localStorage.setItem('webos.keep', '1');
    vi.stubGlobal('confirm', vi.fn(() => false));
    const c = mount(<AboutPanel />);
    click([...c.container.querySelectorAll('button')]
      .find((b) => b.textContent.includes('Factory reset')));
    expect(localStorage.getItem('webos.keep')).toBe('1'); // nothing was wiped
  });
});

describe('Panels — the connection readout', () => {
  it('reports the live connection details and refreshes when they change', () => {
    let changeCb = null;
    const conn = {
      effectiveType: '4g', downlink: 10, rtt: 40, saveData: true,
      addEventListener: (type, cb) => { if (type === 'change') changeCb = cb; },
      removeEventListener: () => {},
    };
    stubGlobal(navigator, 'connection', conn);
    const c = mount(<NetworkPanel />);
    expect(prop(c, 'Effective link')).toBe('4G');
    expect(prop(c, 'Downlink')).toBe('10 Mb/s');
    expect(prop(c, 'Round-trip')).toBe('40 ms');
    expect(prop(c, 'Data saver')).toBe('On');

    conn.effectiveType = '3g';
    act(() => { changeCb(); });
    expect(prop(c, 'Effective link')).toBe('3G');

    // the browser can drop the API entirely — the panel must not crash
    stubGlobal(navigator, 'connection', undefined);
    act(() => { changeCb(); });
    expect(prop(c, 'Effective link')).toBe('unknown');
    expect(prop(c, 'Downlink')).toBe('—');
  });

  it('the platform row falls back to a dash when the platform is unknown', () => {
    stubGlobal(navigator, 'platform', '');
    const c = mount(<NetworkPanel />);
    expect(prop(c, 'Platform')).toBe('—');
  });
});

describe('Taskbar — the tray', () => {
  const setup = () => mount(
    <Taskbar
      openStart={() => {}}
      startOpen={false}
      openSettings={() => {}}
      toggleWidgets={() => {}}
      widgetsOpen={false}
    />
  );

  it('an offline desktop shows the offline glyph and the offline status', () => {
    stubGlobal(navigator, 'onLine', false);
    stubGlobal(navigator, 'connection', {
      effectiveType: '4g', downlink: 10, rtt: 40, saveData: true,
      addEventListener: () => {}, removeEventListener: () => {},
    });
    const c = setup();
    // the offline wifi glyph is the struck-through one
    expect(c.container.querySelector('[data-tray="net"]').innerHTML).toContain('M4 4l16 16');
    click(c.container.querySelector('[data-tray="net"]'));
    const pop = document.querySelector('.net-pop');
    expect(pop.textContent).toContain('Offline');
    expect(pop.textContent).toContain('4G');
    expect(pop.textContent).toContain('10 Mb/s');
    expect(pop.textContent).toContain('40 ms');
    expect(pop.textContent).toContain('On');
  });

  it('the network panel refreshes when the connection changes — and when it vanishes', () => {
    let changeCb = null;
    const conn = {
      effectiveType: '4g',
      addEventListener: (type, cb) => { if (type === 'change') changeCb = cb; },
      removeEventListener: () => {},
    };
    stubGlobal(navigator, 'connection', conn);
    const c = setup();
    click(c.container.querySelector('[data-tray="net"]'));
    conn.effectiveType = '3g';
    act(() => { changeCb(); });
    expect(document.querySelector('.net-pop').textContent).toContain('3G');
    stubGlobal(navigator, 'connection', undefined);
    act(() => { changeCb(); });
    expect(document.querySelector('.net-pop').textContent).toContain('—');
  });

  it('a pointerdown on the taskbar itself keeps an open panel open', () => {
    const c = setup();
    click(c.container.querySelector('[data-tray="vol"]'));
    expect(document.querySelector('.vol-pop')).toBeTruthy();
    fireEvent.pointerDown(c.container.querySelector('#start-btn'));
    expect(document.querySelector('.vol-pop')).toBeTruthy(); // still open
  });

  it('a pointerdown inside the popup keeps the panel open', () => {
    const c = setup();
    click(c.container.querySelector('[data-tray="vol"]'));
    expect(document.querySelector('.vol-pop')).toBeTruthy();
    fireEvent.pointerDown(document.querySelector('.vol-pop'));
    expect(document.querySelector('.vol-pop')).toBeTruthy(); // still open
  });

  it('a key other than Escape leaves the panel open', () => {
    const c = setup();
    click(c.container.querySelector('[data-tray="vol"]'));
    expect(document.querySelector('.vol-pop')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'a' });
    expect(document.querySelector('.vol-pop')).toBeTruthy(); // still open
  });

  it('clicking the same tray button twice closes the panel', () => {
    const c = setup();
    const net = c.container.querySelector('[data-tray="net"]');
    click(net);
    expect(document.querySelector('.net-pop')).toBeTruthy();
    click(net);
    expect(document.querySelector('.net-pop')).toBeNull();
  });

  it('clicking the clock twice closes the calendar popup', () => {
    const c = setup();
    const clock = c.container.querySelector('#clock');
    click(clock);
    expect(document.querySelector('.cal-pop')).toBeTruthy();
    click(clock);
    expect(document.querySelector('.cal-pop')).toBeNull();
  });

  it('while in fullscreen the button offers to leave it', () => {
    stubGlobal(document, 'fullscreenElement', document.documentElement);
    const exit = vi.fn(() => Promise.resolve());
    stubGlobal(document, 'exitFullscreen', exit);
    const c = setup();
    const fsBtn = c.container.querySelector('#fs-btn');
    expect(fsBtn.title).toBe('Exit fullscreen');
    click(fsBtn);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('a taskbar without stored pins shows no app buttons', () => {
    seed('taskbar', { pinned: null });
    const c = setup();
    expect(cur.taskbar.pinned).toBeNull();
    expect(c.container.querySelectorAll('#task-apps .task-app')).toHaveLength(0);
  });
});

describe('Taskbar — pinning', () => {
  const setup = () => mount(
    <Taskbar
      openStart={() => {}}
      startOpen={false}
      openSettings={() => {}}
      toggleWidgets={() => {}}
      widgetsOpen={false}
    />
  );

  it('a non-primary pointerdown does not start a pin drag', () => {
    const c = setup();
    act(() => cur.setTaskbar({ pinned: ['calc', 'files'] }));
    const btn = c.container.querySelector('.task-app');
    fireEvent.pointerDown(btn, { button: 2, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 12, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(btn.className).not.toContain('dragging');
    expect(cur.taskbar.pinned).toEqual(['calc', 'files']); // order untouched
  });

  it('dragging a pinned icon onto a later slot moves it there', () => {
    // happy-dom reports zero-width rects, so give the pin slots real ones
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      const pin = this.getAttribute ? this.getAttribute('data-pin') : null;
      const i = pin === null ? 0 : Number(pin);
      const left = i * 100;
      return {
        left, right: left + 100, top: 0, bottom: 20, width: 100, height: 20, x: left, y: 0,
        toJSON: () => ({}),
      };
    });
    const c = setup();
    act(() => cur.setTaskbar({ pinned: ['calc', 'files', 'weather'] }));
    const btns = [...c.container.querySelectorAll('#task-apps .task-app')];
    expect(btns.map((b) => b.title)).toEqual(['Calculator', 'Files', 'Weather']);
    fireEvent.pointerDown(btns[0], { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 250, clientY: 12, pointerId: 1 }); // slot 2
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(cur.taskbar.pinned).toEqual(['files', 'calc', 'weather']);
  });
});
