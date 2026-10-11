// App shell integration: the real <App/> over the real OS store — welcome
// gating, ?open= deep links, desktop context menus, group lifecycle, virtual
// windows, the halt overlay, tiling keys and focus-follows-mouse. Component
// internals of Taskbar/StartMenu/Window/Welcome are covered in their own
// suites; this is the wiring between them.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import App from '../src/App.jsx';
import { OSProvider } from '../src/os/state.jsx';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('webos.welcomed', 'true'); // most tests: straight to the desktop
  history.replaceState(null, '', '/');
  cleanup();
  document.body.innerHTML = '';
  vi.stubGlobal('fetch', () => new Promise(() => {})); // iframes/store stay hermetic
});

afterEach(() => vi.unstubAllGlobals());

const mount = () => {
  render(<OSProvider><App /></OSProvider>);
  return document.body;
};

const osNow = () => window.__os;
const ctxOpen = async (el) => {
  fireEvent.contextMenu(el, { clientX: 12, clientY: 12 });
  await act(async () => {});
};
const ctxItem = (label) => [...document.querySelectorAll('.ctx-item')].find((b) => b.textContent.includes(label));

describe('App — first run and deep links', () => {
  it('shows Welcome once, dismisses it, and persists the flag', () => {
    localStorage.removeItem('webos.welcomed');
    mount();
    expect(screen.getByRole('dialog', { name: 'Welcome to WebOS' })).toBeTruthy();
    expect(screen.getByText('Enter WebOS →')).toBeTruthy();
    fireEvent.click(screen.getByText('Enter WebOS →'));
    expect(localStorage.getItem('webos.welcomed')).toBe('true');
    expect(screen.queryByRole('dialog', { name: 'Welcome to WebOS' })).toBeNull();
    expect(screen.getByTitle(/^Calculator — /)).toBeTruthy(); // desktop is reachable
  });

  it('a ?open= deep link skips Welcome and launches the app', () => {
    localStorage.removeItem('webos.welcomed');
    history.replaceState(null, '', '/?open=calc');
    mount();
    expect(screen.queryByRole('dialog', { name: 'Welcome to WebOS' })).toBeNull();
    expect(osNow().windows.map((w) => w.appId)).toEqual(['calc']);
  });

  it('the webos:welcome event reopens the overlay (Settings → About)', () => {
    mount();
    expect(screen.queryByRole('dialog', { name: 'Welcome to WebOS' })).toBeNull();
    act(() => { window.dispatchEvent(new CustomEvent('webos:welcome')); });
    expect(screen.getByRole('dialog', { name: 'Welcome to WebOS' })).toBeTruthy();
  });
});

describe('App — desktop icons and windows', () => {
  it('clicking a desktop icon launches its app window', () => {
    mount();
    fireEvent.click(screen.getByTitle(/^Calculator — /));
    expect(osNow().windows.map((w) => w.appId)).toEqual(['calc']);
    const win = document.querySelector('.win[data-id]');
    expect(win).toBeTruthy();
    expect(win.getAttribute('aria-label')).toBe('Calculator');
  });

  it('Meta+Arrow tiles the focused window; Down minimizes when untiled', () => {
    mount();
    fireEvent.click(screen.getByTitle(/^Calculator — /));
    const win = () => osNow().windows[0];
    fireEvent.keyDown(window, { key: 'ArrowLeft', metaKey: true });
    expect(win().snap).toBe('left');
    fireEvent.keyDown(window, { key: 'ArrowRight', metaKey: true });
    expect(win().snap).toBe('right');
    fireEvent.keyDown(window, { key: 'ArrowUp', metaKey: true }); // maximize
    expect(win().max).toBe(true);
    fireEvent.keyDown(window, { key: 'ArrowDown', metaKey: true }); // unmaximize
    expect(win().max).toBe(false);
    fireEvent.keyDown(window, { key: 'ArrowDown', metaKey: true }); // not tiled → minimize
    expect(win().min).toBe(true);
  });

  it('F11 is passed through as a webos:fullscreen event', () => {
    mount();
    document.documentElement.requestFullscreen = vi.fn(async () => {});
    document.exitFullscreen = vi.fn(async () => {});
    const seen = [];
    const h = (e) => seen.push(e.type);
    document.addEventListener('webos:fullscreen', h);
    fireEvent.keyDown(window, { key: 'F11' });
    document.removeEventListener('webos:fullscreen', h);
    expect(seen).toEqual(['webos:fullscreen']);
    delete document.documentElement.requestFullscreen;
    delete document.exitFullscreen;
  });

  it('focus follows the mouse only when the setting is on', async () => {
    mount();
    fireEvent.click(screen.getByTitle(/^Calculator — /));
    await act(async () => { osNow().launch('terminal'); }); // bare dispatches need act to flush
    const [calc, term] = osNow().windows;
    expect(osNow().focused).toBe(term.id); // newest launch focused

    const calcEl = document.querySelector(`.win[data-id="${calc.id}"]`);
    fireEvent.pointerOver(calcEl);
    expect(osNow().focused).toBe(term.id); // off by default: hover does nothing

    await act(async () => { osNow().setUi({ focusHover: true }); });
    fireEvent.pointerOver(calcEl);
    expect(osNow().focused).toBe(calc.id);
  });
});

describe('App — context menus', () => {
  it('the desktop menu launches Terminal, sorts, and opens Add-app dialog', async () => {
    mount();
    await ctxOpen(document.querySelector('#desktop'));
    fireEvent.click(ctxItem('Open Terminal'));
    await act(async () => {});
    expect(osNow().windows.map((w) => w.appId)).toEqual(['terminal']);
    expect(document.querySelector('.ctx-menu')).toBeNull(); // menu closed after picking

    await ctxOpen(document.querySelector('#desktop'));
    fireEvent.click(ctxItem('Add app…'));
    expect(document.querySelector('.ctx-menu')).toBeNull();
    expect(document.querySelector('.aad, [class*="add-app"], dialog, [role="dialog"]')).toBeTruthy(); // AddApp dialog up
  });

  it('the icon menu pins to the taskbar and opens Properties', async () => {
    mount();
    await ctxOpen(screen.getByTitle(/^Calculator — /));
    fireEvent.click(ctxItem('Pin to taskbar'));
    await act(async () => {});
    expect(osNow().taskbar.pinned).toContain('calc');
    expect(JSON.parse(localStorage.getItem('webos.taskbar')).pinned).toContain('calc'); // persisted

    await ctxOpen(screen.getByTitle(/^Calculator — /));
    expect(ctxItem('Unpin from taskbar')).toBeTruthy(); // menu reflects state
    fireEvent.click(ctxItem('Properties'));
    expect(document.querySelector('[class*="props"], [role="dialog"]')).toBeTruthy();
  });

  it('the titlebar menu minimizes and closes its window', async () => {
    mount();
    fireEvent.click(screen.getByTitle(/^Calculator — /));
    const id = osNow().windows[0].id;
    await ctxOpen(document.querySelector(`.win[data-id="${id}"] .titlebar`));
    fireEvent.click(ctxItem('Minimize'));
    expect(osNow().windows[0].min).toBe(true);

    await ctxOpen(document.querySelector(`.win[data-id="${id}"] .titlebar`));
    fireEvent.click(ctxItem('Close'));
    expect(osNow().windows).toHaveLength(0);
  });

  it('Start tiles re-pin live: unpin removes the persisted tile, the All apps row restores it', async () => {
    mount();
    fireEvent.click(document.querySelector('#start-btn'));
    await act(async () => {});
    const tile = [...document.querySelectorAll('.sm-tile')].find((b) => b.textContent.includes('PhotoCraft'));
    expect(tile?.getAttribute('data-cm')).toBe('smapp:photocraft');

    await ctxOpen(tile);
    fireEvent.click(ctxItem('Unpin from Start'));
    await act(async () => {});
    expect(osNow().taskbar.startPins).not.toContain('photocraft');
    expect(JSON.parse(localStorage.getItem('webos.taskbar')).startPins).not.toContain('photocraft');
    expect([...document.querySelectorAll('.sm-tile')].some((b) => b.textContent.includes('PhotoCraft'))).toBe(false);
    expect(document.querySelector('#start-menu')).toBeTruthy(); // menu stays open for more pinning

    const row = [...document.querySelectorAll('#start-menu .sm-cat .sm-app')]
      .find((b) => b.textContent.includes('PhotoCraft'));
    await ctxOpen(row);
    fireEvent.click(ctxItem('Pin to Start'));
    await act(async () => {});
    expect(osNow().taskbar.startPins).toContain('photocraft');
    expect([...document.querySelectorAll('.sm-tile')].some((b) => b.textContent.includes('PhotoCraft'))).toBe(true);
  });

  it('the taskbar menu offers widgets and closes all windows', async () => {
    mount();
    fireEvent.click(screen.getByTitle(/^Calculator — /));
    await ctxOpen(document.querySelector('#taskbar'));
    fireEvent.click(ctxItem('Widgets')); // picking an item closes the menu…
    expect(document.querySelector('#sidebar')).toBeTruthy(); // widget panel opened

    await ctxOpen(document.querySelector('#taskbar')); // …so reopen for the next pick
    fireEvent.click(ctxItem('Close all windows'));
    expect(osNow().windows).toHaveLength(0);
  });
});

describe('App — groups', () => {
  const newGroup = async () => {
    await ctxOpen(document.querySelector('#desktop'));
    fireEvent.click(ctxItem('New group'));
    await act(async () => {});
    return screen.getByTitle('New group — group of 0');
  };

  it('creating a group adds a tile; the popup renames and removes it', async () => {
    mount();
    const tile = await newGroup();
    fireEvent.click(tile); // opens the group popup
    expect(screen.getByRole('dialog', { name: 'New group' })).toBeTruthy();
    expect(screen.getByText(/Empty group — drag app icons/)).toBeTruthy();

    const input = screen.getByLabelText('Group name');
    fireEvent.change(input, { target: { value: 'Games' } });
    fireEvent.focusOut(input);
    expect(screen.getByTitle('Games — group of 0')).toBeTruthy(); // renamed everywhere

    fireEvent.keyDown(document, { key: 'Escape' }); // popup closed by Escape
    expect(screen.queryByRole('dialog', { name: 'Games' })).toBeNull();

    fireEvent.click(screen.getByTitle('Games — group of 0'));
    fireEvent.click(screen.getByText('Remove group'));
    expect(screen.queryByTitle('Games — group of 0')).toBeNull(); // icons return to the grid
  });

  it('Escape is bound at document level so it works from the name input', async () => {
    mount();
    const tile = await newGroup();
    fireEvent.click(tile);
    const input = screen.getByLabelText('Group name');
    fireEvent.change(input, { target: { value: 'typed' } });
    fireEvent.keyDown(input, { key: 'Escape' }); // focus inside the input
    expect(screen.queryByRole('dialog', { name: 'New group' })).toBeNull();
    expect(screen.getByTitle('New group — group of 0')).toBeTruthy(); // unrenamed
  });
});

describe('App — virtual windows and power', () => {
  it('the App Store renders as a movable virtual window', async () => {
    mount();
    await ctxOpen(document.querySelector('#desktop'));
    fireEvent.click(ctxItem('App Store…'));
    await act(async () => {});
    const store = document.querySelector('section.win[aria-label="App Store"]');
    expect(store).toBeTruthy();
    expect(store.querySelector('.win-body.virtual')).toBeTruthy();
    expect(screen.getByText('App Store', { selector: '.titlebar .t' })).toBeTruthy();

    fireEvent.click(store.querySelector('.tb-btn.close'));
    expect(document.querySelector('section.win[aria-label="App Store"]')).toBeNull();
  });

  it('Shut down halts the desktop with an honest overlay', async () => {
    mount();
    fireEvent.click(document.querySelector('#start-btn'));
    fireEvent.click(document.querySelector('.sm-pwr.danger'));
    const halt = document.querySelector('#halt');
    expect(halt.getAttribute('role')).toBe('alertdialog');
    expect(screen.getByText('System halted')).toBeTruthy();
    expect(screen.getByText(/It is now safe to close this browser tab/)).toBeTruthy();
    expect(screen.getByText('Power on')).toBeTruthy(); // reload escape hatch
  });
});
