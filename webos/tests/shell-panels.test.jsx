// Settings panels — direct interaction coverage for every panel in
// shell/settings/Panels.jsx: desktop/taskbar/widgets/sound/saver controls
// write through os setters and persist; network/storage read the real
// browser state; apps/about wire launch/uninstall/reset with confirm gates.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';
import { VERSION } from '../src/version.js';
import {
  DesktopPanel, TaskbarPanel, WidgetsPanel, SoundPanel, SaverPanel,
  NetworkPanel, StoragePanel, AppsPanel, AboutPanel,
} from '../src/shell/settings/Panels.jsx';

let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};
const mount = (ui) => render(<OSProvider><Probe />{ui}</OSProvider>);
const radios = (c, label) =>
  [...c.container.querySelectorAll(`[role="radiogroup"][aria-label="${label}"] [role="radio"]`)];
const click = (el) => act(() => { fireEvent.click(el); });

const makeCtx = () => ({
  setTransform: () => {}, fillRect: () => {}, clearRect: () => {},
  beginPath: () => {}, arc: () => {}, fill: () => {}, stroke: () => {},
  moveTo: () => {}, lineTo: () => {}, closePath: () => {}, fillText: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} }),
});
beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  document.body.className = '';
  document.body.style.cssText = '';
  document.body.removeAttribute('data-persona');
  vi.restoreAllMocks();
  // SaverPanel embeds the live SaverPreview (canvas fx) — stub like the
  // SaverPreview suite does so panels test the settings surface.
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => makeCtx(), configurable: true, writable: true,
  });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'getContext');
  vi.unstubAllGlobals();
});

describe('DesktopPanel', () => {
  it('icon size, arrangement, grid spacing each persist through the os api', () => {
    const c = mount(<DesktopPanel />);
    click(radios(c, 'Desktop icon size')[2]); // Large
    expect(cur.desktop.iconSize).toBe('lg');
    expect(JSON.parse(localStorage.getItem('webos.desktop')).iconSize).toBe('lg');
    click(radios(c, 'Desktop arrangement')[1]); // Sorted by name
    expect(cur.desktop.sort).toBe('name');
    expect(c.container.textContent).toContain('auto-sort alphabetically');
    click(radios(c, 'Desktop grid spacing')[0]); // Compact
    expect(cur.desktop.gap).toBe('compact');
  });

  it('focus-follows-mouse toggles the ui flag', () => {
    const c = mount(<DesktopPanel />);
    const box = c.container.querySelector('input[type="checkbox"]');
    click(box);
    expect(cur.ui.focusHover).toBe(true);
    click(box);
    expect(cur.ui.focusHover).toBe(false);
  });
});

describe('TaskbarPanel', () => {
  it('position/alignment/icon size radios persist', () => {
    const c = mount(<TaskbarPanel />);
    click(radios(c, 'Taskbar position')[1]);
    expect(cur.taskbar.position).toBe('top');
    click(radios(c, 'Taskbar alignment')[2]);
    expect(cur.taskbar.align).toBe('right');
    click(radios(c, 'Taskbar icon size')[0]);
    expect(cur.taskbar.iconSize).toBe('sm');
  });

  it('behavior + clock checkboxes toggle their taskbar flags', () => {
    const c = mount(<TaskbarPanel />);
    const boxes = [...c.container.querySelectorAll('input[type="checkbox"]')];
    expect(boxes).toHaveLength(4); // autohide, labels, clock24, showDate
    click(boxes[0]);
    expect(cur.taskbar.autohide).toBe(true);
    click(boxes[1]);
    expect(cur.taskbar.labels).toBe(false);
    click(boxes[2]);
    expect(cur.taskbar.clock24).toBe(true);
    click(boxes[3]);
    expect(cur.taskbar.showDate).toBe(false);
  });
});

describe('WidgetsPanel', () => {
  it('Show/Hide adds and removes widgets from the enabled order', () => {
    const c = mount(<WidgetsPanel />);
    act(() => cur.setWidgets({ enabled: [] })); // deterministic: none enabled
    expect(c.container.querySelectorAll('button.accent').length).toBeGreaterThan(0);
    const rows = [...c.container.querySelectorAll('.widget-row')];
    click(rows[0].querySelector('button.accent')); // Show → appends the first WIDGET_ID
    expect(cur.widgets.enabled.length).toBe(1);
    // now Hide it again
    const rows2 = [...c.container.querySelectorAll('.widget-row')];
    click(rows2[0].querySelector('button:not(.accent):not([title])')); // Hide (after ↑/↓)
    expect(cur.widgets.enabled.length).toBe(0);
  });

  it('move up/down reorders enabled widgets; edge buttons are disabled', () => {
    const c = mount(<WidgetsPanel />);
    act(() => cur.setWidgets({ enabled: ['clock', 'notes', 'weather'] }));
    const row = (label) => [...c.container.querySelectorAll('.widget-row')]
      .find((r) => r.textContent.includes(label));
    // clock is first: its ↑ is disabled
    const clockUp = row('Clock').querySelector('button[title="Move up"]');
    expect(clockUp.disabled).toBe(true);
    const weatherDown = row('Weather').querySelector('button[title="Move down"]');
    expect(weatherDown.disabled).toBe(true);
    click(row('Clock').querySelector('button[title="Move down"]'));
    expect(cur.widgets.enabled).toEqual(['notes', 'clock', 'weather']);
    click(row('Weather').querySelector('button[title="Move up"]'));
    expect(cur.widgets.enabled).toEqual(['notes', 'weather', 'clock']);
  });
});

describe('SoundPanel', () => {
  it('the slider sets volume and unmutes; the button mutes and flips its label', () => {
    const c = mount(<SoundPanel />);
    const slider = c.container.querySelector('input[type="range"]');
    act(() => { fireEvent.change(slider, { target: { value: '42' } }); });
    expect(cur.volume.level).toBeCloseTo(0.42);
    expect(cur.volume.muted).toBe(false);
    const btn = [...c.container.querySelectorAll('button')].find((b) => b.textContent === 'Mute');
    click(btn);
    expect(cur.volume.muted).toBe(true);
    expect(c.container.textContent).toContain('0%');
    expect([...c.container.querySelectorAll('button')].some((b) => b.textContent === 'Unmute')).toBe(true);
  });
});

describe('SaverPanel', () => {
  it('kind chips set the saver; timeout slider persists; off disables controls', () => {
    const c = mount(<SaverPanel />);
    click(radios(c, 'Screen saver kind')[2]); // Starfield
    expect(cur.saver.kind).toBe('starfield');
    expect(c.container.textContent).toContain('Animation speed'); // fx section visible
    const speed = c.container.querySelector('#saver-speed');
    act(() => { fireEvent.change(speed, { target: { value: '2' } }); });
    expect(cur.saver.speed).toBe(2);
    const timeout = c.container.querySelector('#saver-timeout');
    act(() => { fireEvent.change(timeout, { target: { value: '30' } }); });
    expect(cur.saver.timeoutMin).toBe(30);
  });

  it('photos shows the slideshow section; clock shows its note; off hides speed', () => {
    const c = mount(<SaverPanel />);
    click(radios(c, 'Screen saver kind')[7]); // Photo shuffle
    expect(c.container.textContent).toContain('Per photo');
    const secs = c.container.querySelector('#saver-photo');
    act(() => { fireEvent.change(secs, { target: { value: '12' } }); });
    expect(cur.saver.photoSecs).toBe(12);
    click(radios(c, 'Screen saver kind')[8]); // Clock
    expect(c.container.textContent).toContain("taskbar's 12/24-hour setting");
    expect(c.container.textContent).not.toContain('Animation speed');
  });

  it('Preview now dispatches the preview event; disabled while off', () => {
    const c = mount(<SaverPanel />);
    const seen = vi.fn();
    window.addEventListener('webos:saver-preview', seen);
    const preview = [...c.container.querySelectorAll('button')].find((b) => b.textContent === 'Preview now');
    expect(preview.disabled).toBe(true); // kind starts 'off'
    click(radios(c, 'Screen saver kind')[1]); // Water
    click(preview);
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener('webos:saver-preview', seen);
  });
});

describe('NetworkPanel', () => {
  it('reads the real connection state; live online/offline events update Status', () => {
    const c = mount(<NetworkPanel />);
    expect(c.container.textContent).toContain(navigator.onLine ? 'Connected' : 'Offline');
    expect(c.container.textContent).toContain('unknown'); // happy-dom has no connection info
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(c.container.textContent).toContain('Offline');
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(c.container.textContent).toContain('Connected');
    expect(c.container.textContent).toContain(navigator.platform || '—');
  });
});

describe('StoragePanel', () => {
  it('lists webos.* keys with sizes, Clear removes + rescans', () => {
    localStorage.setItem('webos.test.big', 'x'.repeat(500));
    localStorage.setItem('webos.test.small', 'y');
    localStorage.setItem('unrelated', 'keep me');
    const c = mount(<StoragePanel />);
    const codes = [...c.container.querySelectorAll('code')].map((el) => el.textContent);
    expect(codes).toEqual(['webos.test.big', 'webos.test.small']); // sorted by size
    expect(c.container.textContent).toContain('1000 B');
    expect(c.container.textContent).not.toContain('unrelated');
    const clear = [...c.container.querySelectorAll('button')].find((b) => b.textContent === 'Clear');
    click(clear);
    expect(localStorage.getItem('webos.test.big')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep me');
    expect([...c.container.querySelectorAll('code')].map((el) => el.textContent)).toEqual(['webos.test.small']);
  });

  it('shows the storage estimate when the manager is available', async () => {
    Reflect.defineProperty(navigator, 'storage', {
      value: { estimate: async () => ({ usage: 2 * 1048576, quota: 512 * 1048576 }) },
      configurable: true,
    });
    const c = mount(<StoragePanel />);
    await act(async () => { await Promise.resolve(); });
    expect(c.container.textContent).toContain('2.0 MB used of 512 MB');
    Reflect.deleteProperty(navigator, 'storage');
  });

  it('Reset cancels when confirm is dismissed — nothing is wiped; confirming wipes', () => {
    localStorage.setItem('webos.keep', '1');
    // happy-dom has no window.confirm — stub the bare global the panel calls.
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmSpy);
    const c = mount(<StoragePanel />);
    const reset = [...c.container.querySelectorAll('button')].find((b) => b.textContent === 'Reset WebOS data');
    click(reset);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('webos.keep')).toBe('1');
    vi.stubGlobal('confirm', vi.fn(() => true));
    click(reset);
    expect(localStorage.getItem('webos.keep')).toBeNull(); // factoryReset ran
  });
});

describe('AppsPanel', () => {
  it('lists every app; system rows open but expose no Remove', () => {
    const c = mount(<AppsPanel />);
    expect(c.container.textContent).toContain(`Installed apps (${cur.apps.length})`);
    const row = [...c.container.querySelectorAll('.widget-row')].find((r) => r.textContent.includes('Calculator'));
    expect(row.textContent).toContain('system');
    expect([...row.querySelectorAll('button')].some((b) => b.textContent === 'Remove')).toBe(false);
    click([...row.querySelectorAll('button')].find((b) => b.textContent === 'Open'));
    expect(cur.windows.length).toBe(1);
  });

  it('a store app shows Remove and uninstalling drops it from the list', () => {
    const c = mount(<AppsPanel />);
    act(() => cur.install('g2048')); // in the store but NOT a default
    const row = [...c.container.querySelectorAll('.widget-row')].find((r) => r.textContent.includes('2048'));
    expect(cur.isDefault('g2048')).toBe(false);
    const remove = [...row.querySelectorAll('button')].find((b) => b.textContent === 'Remove');
    click(remove);
    expect(cur.apps.some((a) => a.id === 'g2048')).toBe(false);
  });
});

describe('AboutPanel', () => {
  it('shows the shell version + persona; Show welcome dispatches its event', () => {
    const c = mount(<AboutPanel />);
    expect(c.container.textContent).toContain(`WebOS ${VERSION}`);
    expect(c.container.textContent).toContain(cur.persona);
    const seen = vi.fn();
    window.addEventListener('webos:welcome', seen);
    click([...c.container.querySelectorAll('button')].find((b) => b.textContent.includes('Show welcome')));
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener('webos:welcome', seen);
  });

  it('Reset look & layout restores the factory persona after confirm; cancel keeps it', () => {
    const c = mount(<AboutPanel />);
    act(() => cur.setPersona('mac'));
    const reset = [...c.container.querySelectorAll('button')].find((b) => b.textContent.includes('Reset look'));
    // happy-dom has no window.confirm — stub the bare global the panel calls.
    vi.stubGlobal('confirm', vi.fn(() => false));
    click(reset);
    expect(cur.persona).toBe('mac'); // cancelled
    vi.stubGlobal('confirm', vi.fn(() => true));
    click(reset);
    expect(cur.persona).toBe('win'); // factory default persona restored
  });

  it('Factory reset wipes only webos.* keys after confirm', () => {
    localStorage.setItem('webos.killme', '1');
    localStorage.setItem('keepme', 'stay');
    const reload = vi.fn();
    Reflect.defineProperty(window.location, 'reload', { value: reload, configurable: true });
    vi.stubGlobal('confirm', vi.fn(() => true));
    const c = mount(<AboutPanel />);
    click([...c.container.querySelectorAll('button')].find((b) => b.textContent.includes('Factory reset')));
    expect(localStorage.getItem('webos.killme')).toBeNull();
    expect(localStorage.getItem('keepme')).toBe('stay');
  });
});
