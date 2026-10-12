// Shell: Taskbar (app buttons, tray panels, pin drag), the Calendar popup,
// and the global useContextMenu hook.
import React, { useCallback } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';
import Taskbar from '../src/shell/Taskbar.jsx';
import Calendar from '../src/shell/Calendar.jsx';
import { useContextMenu } from '../src/shell/ContextMenu.jsx';

let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};

const mount = (ui) => render(
  <OSProvider>
    <Probe />
    {ui}
  </OSProvider>
);

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  document.body.className = '';
  document.body.style.cssText = '';
  document.body.removeAttribute('data-persona');
});

describe('Taskbar', () => {
  const setup = (startOpen = false) => mount(
    <Taskbar
      openStart={() => {}}
      startOpen={startOpen}
      openSettings={() => {}}
      toggleWidgets={() => {}}
      widgetsOpen={false}
    />
  );

  it('renders start button, pinned apps, tray and a ticking clock', () => {
    const c = setup(true);
    act(() => cur.setTaskbar({ pinned: ['calc', 'files'] }));
    expect(c.container.querySelector('#start-btn.open')).toBeTruthy();
    const pins = [...c.container.querySelectorAll('#task-apps .task-app')];
    expect(pins.map((b) => b.title)).toEqual(['Calculator', 'Files']);
    expect(c.container.querySelector('[data-tray="vol"]')).toBeTruthy();
    expect(c.container.querySelector('[data-tray="net"]')).toBeTruthy();
    expect(c.container.querySelector('#clock-time').textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it('Start + apps form one #tb-main group the alignment setting can move', () => {
    const c = setup(true);
    const main = c.container.querySelector('#tb-main');
    expect(main).toBeTruthy();
    expect(main.querySelector('#start-btn')).toBeTruthy();
    expect(main.querySelector('#task-apps')).toBeTruthy();
  });

  it('every alignment value has real CSS — no decorative settings (data-tb-align)', () => {
    // state.jsx writes body[data-tb-align]; this guards that styles.css
    // actually consumes it for BOTH surfaces (bar group + menu anchor).
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
    for (const align of ['center', 'right']) {
      expect(css).toMatch(new RegExp(`body\\[data-tb-align="${align}"\\] #tb-main`));
      expect(css).toMatch(new RegExp(`body\\[data-tb-align="${align}"\\] #start-menu`));
    }
  });

  it('appends running-but-unpinned apps after the pins, with a running dot', () => {
    const c = setup();
    act(() => cur.setTaskbar({ pinned: ['calc'] }));
    expect(c.container.querySelectorAll('.task-app')).toHaveLength(1);
    act(() => cur.launch('weather'));
    const apps = [...c.container.querySelectorAll('.task-app')];
    expect(apps.map((b) => b.title)).toEqual(['Calculator', 'Weather']);
    expect(apps[0].querySelector('.pin-dot')).toBeNull(); // pinned, not running
    expect(apps[1].querySelector('.pin-dot')).toBeTruthy(); // running, unpinned
  });

  it('clicking a non-running app launches it; clicking a running one toggles minimize', () => {
    const c = setup();
    act(() => cur.setTaskbar({ pinned: ['calc'] }));
    fireEvent.click(c.container.querySelector('.task-app'));
    expect(cur.windows).toHaveLength(1);
    expect(cur.windows[0].appId).toBe('calc');
    // second click minimizes the focused window
    fireEvent.click(c.container.querySelector('.task-app'));
    expect(cur.windows[0].min).toBe(true);
    // third click restores and focuses it
    fireEvent.click(c.container.querySelector('.task-app'));
    expect(cur.windows[0].min).toBe(false);
    expect(cur.focused).toBe(cur.windows[0].id);
  });

  it('cycles focus across several visible windows of the same app', () => {
    const c = setup();
    act(() => cur.setTaskbar({ pinned: ['calc'] }));
    act(() => cur.launch('calc'));
    const a = cur.windows[0].id;
    act(() => cur.launch('calc')); // second instance
    const b = cur.windows[1].id;
    act(() => cur.focus(b));
    fireEvent.click(c.container.querySelector('.task-app'));
    expect(cur.focused).toBe(a);
    fireEvent.click(c.container.querySelector('.task-app'));
    expect(cur.focused).toBe(b);
  });

  it('volume panel: opens in a body portal, slider sets level, mute toggles', () => {
    const c = setup();
    fireEvent.click(c.container.querySelector('[data-tray="vol"]'));
    const pop = document.querySelector('.vol-pop');
    expect(pop).toBeTruthy();
    expect(document.querySelector('#tb-portal')).toBeTruthy();
    const slider = pop.querySelector('input[type="range"]');
    fireEvent.change(slider, { target: { value: '50' } });
    expect(cur.volume.level).toBe(0.5);
    fireEvent.click([...pop.querySelectorAll('button')].find((b) => /mute/i.test(b.textContent)));
    expect(cur.volume.muted).toBe(true);
    expect(pop.textContent).toContain('0%');
  });

  it('network panel shows live connection rows; calendar panel renders a month grid', () => {
    const c = setup();
    fireEvent.click(c.container.querySelector('[data-tray="net"]'));
    expect(document.querySelector('.net-pop').textContent).toContain('Connected');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.net-pop')).toBeNull();
    fireEvent.click(c.container.querySelector('#clock'));
    expect(document.querySelector('.cal-pop')).toBeTruthy();
  });

  it('any pointerdown outside the tray root closes an open panel', () => {
    const c = setup();
    fireEvent.click(c.container.querySelector('[data-tray="vol"]'));
    expect(document.querySelector('.vol-pop')).toBeTruthy();
    fireEvent.pointerDown(document.body, { bubbles: true });
    expect(document.querySelector('.vol-pop')).toBeNull();
  });

  it('shows the date when enabled; clock24 preference is honored', () => {
    const c = setup();
    act(() => cur.setTaskbar({ showDate: true, clock24: true }));
    expect(c.container.querySelector('#clock-date')).toBeTruthy();
    const t = c.container.querySelector('#clock-time').textContent;
    // 24h clock: no AM/PM marker (happy-dom has full ICU)
    expect(t).not.toMatch(/(AM|PM)/i);
  });

  it('pin drag swallows the click that follows the gesture', async () => {
    const c = setup();
    act(() => cur.setTaskbar({ pinned: ['calc'] }));
    const btn = c.container.querySelector('.task-app');
    fireEvent.pointerDown(btn, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 60, clientY: 12, pointerId: 1 });
    expect(btn.className).toContain('dragging');
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(btn.className).not.toContain('dragging');
    fireEvent.click(btn); // the click that lands right after the drag
    expect(cur.windows).toHaveLength(0);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    fireEvent.click(btn); // a real click after the swallow window
    expect(cur.windows).toHaveLength(1);
  });

  it('pin drag onto another slot reorders the pinned list', () => {
    const c = setup();
    act(() => cur.setTaskbar({ pinned: ['calc', 'files'] }));
    const btns = [...c.container.querySelectorAll('#task-apps .task-app')];
    expect(btns.map((b) => b.title)).toEqual(['Calculator', 'Files']);
    // slot rects are zero-width in happy-dom, so only clientX=0 lands — on slot 0
    fireEvent.pointerDown(btns[1], { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 12, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(cur.taskbar.pinned).toEqual(['files', 'calc']);
  });

  it('the volume panel Reset returns to 0.7 unmuted', () => {
    const c = setup();
    act(() => cur.setVolume({ level: 0.2, muted: true }));
    fireEvent.click(c.container.querySelector('[data-tray="vol"]'));
    const pop = document.querySelector('.vol-pop');
    act(() => { fireEvent.click([...pop.querySelectorAll('button')].find((b) => b.textContent === 'Reset')); });
    expect(cur.volume).toMatchObject({ level: 0.7, muted: false });
  });

  it('a pin drag under the threshold stays a click', () => {
    const c = setup();
    act(() => cur.setTaskbar({ pinned: ['calc'] }));
    const btn = c.container.querySelector('.task-app');
    fireEvent.pointerDown(btn, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 12, clientY: 11, pointerId: 1 }); // < 6px
    expect(btn.className).not.toContain('dragging');
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(btn);
    expect(cur.windows).toHaveLength(1);
  });
});

describe('Calendar popup component', () => {
  it('renders the current month with Monday-first day headers', () => {
    const c = mount(<Calendar />);
    const now = new Date();
    expect(c.container.textContent).toContain(now.toLocaleString('en-US', { month: 'long' }));
    expect(c.container.textContent).toContain(String(now.getFullYear()));
    expect(c.container.querySelectorAll('.cal-dow')).toHaveLength(7);
    expect(c.container.querySelector('.cal-dow').textContent).toBe('Mo');
    // the grid is whole weeks (padding cells are plain divs) and contains
    // every day of the month exactly once
    expect(c.container.querySelectorAll('.cal-grid > *').length % 7).toBe(0);
    const cells = c.container.querySelectorAll('.cal-day');
    expect(cells).toHaveLength(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
    expect([...cells].map((d) => d.textContent)).toEqual(
      Array.from({ length: cells.length }, (_, i) => String(i + 1))
    );
    expect(c.container.querySelector('.cal-day.today')).toBeTruthy();
  });

  it('navigates months in both directions', () => {
    const c = mount(<Calendar />);
    const now = new Date();
    const name = (y, m) => new Date(y, m).toLocaleString('en-US', { month: 'long' });
    fireEvent.click(c.container.querySelector('[aria-label="next month"]'));
    const nextM = (now.getMonth() + 1) % 12;
    expect(c.container.textContent).toContain(name(now.getFullYear(), nextM));
    fireEvent.click(c.container.querySelector('[aria-label="previous month"]'));
    fireEvent.click(c.container.querySelector('[aria-label="previous month"]'));
    const prevM = (now.getMonth() + 11) % 12;
    expect(c.container.textContent).toContain(name(now.getFullYear(), prevM));
  });

  it('adding an event marks the day and lists it; delete removes it', () => {
    const c = mount(<Calendar />);
    const form = c.container.querySelector('.cal-ev-form');
    fireEvent.change(form.querySelector('input'), { target: { value: 'Ship 3.8.0' } });
    fireEvent.submit(form);
    expect(c.container.querySelector('.cal-ev').textContent).toContain('Ship 3.8.0');
    expect(c.container.querySelector('.cal-ev-title').textContent).toContain('1 item');
    expect(Object.keys(cur.events)).toHaveLength(1);
    fireEvent.click(c.container.querySelector('.cal-ev [aria-label="delete event"]'));
    expect(c.container.querySelector('.cal-ev')).toBeNull();
  });

  it('an empty draft does not create an event', () => {
    const c = mount(<Calendar />);
    const form = c.container.querySelector('.cal-ev-form');
    fireEvent.submit(form);
    expect(cur.events ?? {}).toEqual({});
  });

  it('selecting another day moves the editor to that date', () => {
    const c = mount(<Calendar />);
    const now = new Date();
    const days = [...c.container.querySelectorAll('.cal-day')];
    const target = days.find((d) => d.textContent === '15');
    fireEvent.click(target);
    expect(c.container.querySelector('.cal-ev-title').textContent)
      .toContain(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`);
  });
});

describe('useContextMenu', () => {
  const ITEMS = {
    app: () => [
      { label: 'Open', run: vi.fn() },
      '-',
      { label: 'Unpin', run: vi.fn() },
    ],
    desk: () => [], // empty lists suppress the menu entirely
  };

  const Host = () => {
    const items = useCallback((kind, arg) => {
      const built = ITEMS[kind]?.(arg);
      return built; // stable identity not required; effect rebinds per render
    }, []);
    const { menu, isOpen, close } = useContextMenu(items);
    return (
      <div>
        <div data-cm="app:calc">icon</div>
        <div data-cm="desk:x">desk</div>
        <div>elsewhere</div>
        {menu}
        <button type="button" id="close-btn" onClick={close}>close</button>
        <span id="open-state">{String(isOpen)}</span>
      </div>
    );
  };

  it('opens on contextmenu of a data-cm target with the built items', () => {
    const c = mount(<Host />);
    fireEvent.contextMenu(c.container.querySelector('[data-cm="app:calc"]'));
    const m = document.querySelector('.ctx-menu');
    expect(m).toBeTruthy();
    expect([...m.querySelectorAll('.ctx-item')].map((b) => b.textContent)).toEqual(['Open', 'Unpin']);
    expect(m.querySelector('.ctx-sep')).toBeTruthy();
    expect(m.style.left).toBe('0px');
  });

  it('item click runs the action and closes; an empty item list opens nothing', () => {
    const c = mount(<Host />);
    fireEvent.contextMenu(c.container.querySelector('[data-cm="app:calc"]'));
    const m = document.querySelector('.ctx-menu');
    fireEvent.click(m.querySelector('.ctx-item'));
    expect(document.querySelector('.ctx-menu')).toBeNull();
    fireEvent.contextMenu(c.container.querySelector('[data-cm="desk:x"]'));
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });

  it('any window click or blur dismisses the menu', () => {
    const c = mount(<Host />);
    fireEvent.contextMenu(c.container.querySelector('[data-cm="app:calc"]'));
    expect(document.querySelector('.ctx-menu')).toBeTruthy();
    fireEvent.click(c.container.querySelector('#close-btn'));
    expect(document.querySelector('.ctx-menu')).toBeNull();
    fireEvent.contextMenu(c.container.querySelector('[data-cm="app:calc"]'));
    fireEvent.blur(window);
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });

  it('flips inside the viewport when opened near the right edge', () => {
    const c = mount(<Host />);
    fireEvent.contextMenu(c.container.querySelector('[data-cm="app:calc"]'), { clientX: 1020, clientY: 30 });
    const m = document.querySelector('.ctx-menu');
    expect(m).toBeTruthy();
    // measured width is 0 in happy-dom → clamps to innerWidth - 8
    expect(Number.parseInt(m.style.left, 10)).toBeLessThanOrEqual(window.innerWidth - 8);
  });
});
